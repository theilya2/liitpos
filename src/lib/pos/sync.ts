import { create } from "zustand";
import { pairedBaselineUpload } from "@/lib/pos/baseline";
import { probeCloud, pullCloud, pushCloud, type SyncClient, type SyncFailureReason } from "@/lib/pos/cloud-api";
import { isDemoMode } from "@/lib/pos/demo";
import { catalogDoc, mergeOutbox, snapshotDocs, type CloudDoc } from "@/lib/pos/docs";
import { clearSessionToken, isNativeApp, nativeVersion, readSessionToken } from "@/lib/pos/native";
import { REVOKED_DETAIL, type RegisterClaim } from "@/lib/pos/register";
import { usePos } from "@/lib/pos/store";

export type CloudPhase = "checking" | "offline" | "local" | "syncing" | "synced" | "error" | "revoked";

type CloudView = {
  phase: CloudPhase;
  detail: string;
  /** Completed sync attempts. Zero means the first pull has not finished. */
  attempt: number;
};

export const useCloudStatus = create<CloudView>(() => ({
  phase: "checking",
  detail: "",
  attempt: 0,
}));

let running = false;
let queued = false;
let blockedToken = "";

export const UNPAIRED_DETAIL = "המכשיר לא משויך. צריך קישור או קוד QR מהמשרד האחורי, לא רק כתובת שרת.";
export const OFFLINE_DETAIL = "אין רשת. המכירות נשמרות במכשיר עד שהחיבור חוזר.";

export function serverErrorDetail(status: number): string {
  return `השרת החזיר שגיאה ${status}.`;
}

export function unreachableDetail(browserOffline: boolean): string {
  if (browserOffline) {
    return "הדפדפן דיווח שאין רשת, אבל השרת נגיש. בקשת הסנכרון נכשלה בלי קוד שגיאה.";
  }
  return "השרת נגיש, אבל בקשת הסנכרון נכשלה בלי קוד שגיאה.";
}

/**
 * Offline only after the sync request itself failed on the network, and a
 * reachability probe also failed. navigator.onLine is not enough: Android
 * WebView can leave it stuck at false while the radio works. A probe that
 * reaches the host overrides that stuck flag.
 */
export function shouldReportOffline(networkError: boolean, browserOffline: boolean, probeFailed: boolean): boolean {
  if (!networkError) return false;
  if (!(browserOffline || probeFailed)) return false;
  // WebView can stick onLine at false. A probe that reached the host wins.
  if (!probeFailed) return false;
  return true;
}

function browserReportsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function failureOf(error: unknown): { reason: SyncFailureReason | ""; status: number } {
  if (!error || typeof error !== "object") return { reason: "", status: 0 };
  const value = error as { reason?: unknown; status?: unknown; message?: unknown };
  const reason =
    value.reason === "unpaired" || value.reason === "revoked" || value.reason === "no-address" || value.reason === "http" || value.reason === "network"
      ? value.reason
      : "";
  const status = typeof value.status === "number" ? value.status : 0;
  if (!reason && (status === 401 || value.message === "Unauthorized")) return { reason: "unpaired", status: status || 401 };
  if (!reason && error instanceof TypeError) return { reason: "network", status: 0 };
  if (!reason && typeof value.message === "string" && /failed to fetch|networkerror|load failed|network request failed/i.test(value.message)) {
    return { reason: "network", status: 0 };
  }
  return { reason, status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** If a parallel sync overwrote the catalog, put local-only products back in the queue. */
function requeueCatalogDrift(docs: CloudDoc[]) {
  const state = usePos.getState();
  const extra: CloudDoc[] = [];
  const now = new Date().toISOString();
  for (const branch of state.stores) {
    const remote = docs.find((doc) => doc.kind === "catalog" && doc.businessId === branch.id && !doc.deleted);
    if (!remote || !isRecord(remote.doc) || !Array.isArray(remote.doc.products)) continue;
    const ids = new Set(remote.doc.products.map((item) => (isRecord(item) && typeof item.id === "string" ? item.id : "")));
    if (branch.products.some((product) => !ids.has(product.id))) extra.push(catalogDoc(branch, now));
  }
  if (extra.length) state.replaceOutbox(mergeOutbox(state.outbox, extra));
}

function releaseStamp(docs: CloudDoc[]): string | null {
  let best = 0;
  let value: string | null = null;
  for (const doc of docs) {
    if (doc.kind !== "release" || doc.deleted) continue;
    const raw = doc.doc;
    const fromDoc = raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { releasedAt?: unknown }).releasedAt === "string"
      ? (raw as { releasedAt: string }).releasedAt
      : doc.updatedAt;
    const ms = Date.parse(fromDoc);
    if (Number.isFinite(ms) && ms >= best) {
      best = ms;
      value = fromDoc;
    }
  }
  return value;
}

function syncClient(): SyncClient {
  const version = nativeVersion();
  const appVersion = version.versionName || (isNativeApp() ? String(version.versionCode || "android") : "web");
  return { appVersion: appVersion.slice(0, 40) || "web", pending: usePos.getState().outbox.length };
}

function rememberRegister(register: RegisterClaim | null) {
  if (register) usePos.getState().adoptRegister(register);
}

async function flushOutbox() {
  let state = usePos.getState();
  let guard = 0;
  while (state.outbox.length && guard < 8) {
    const batch = state.outbox.slice(0, 20);
    const result = await pushCloud(batch, syncClient());
    rememberRegister(result.register);
    const done = new Set([...result.accepted, ...result.skipped]);
    state.ackOutbox(batch.map((doc) => doc.id).filter((id) => done.has(id)));
    state = usePos.getState();
    guard += 1;
  }
}

async function reportFailure(error: unknown) {
  const failure = failureOf(error);
  if (failure.reason === "revoked") {
    blockedToken = readSessionToken();
    clearSessionToken();
    usePos.getState().markRegisterRevoked();
    usePos.getState().lock();
    usePos.getState().setCloudCursor(null);
    useCloudStatus.setState({ phase: "revoked", detail: REVOKED_DETAIL });
    return;
  }
  if (failure.reason === "unpaired") {
    const detail = failure.status ? `${UNPAIRED_DETAIL} ${serverErrorDetail(failure.status)}` : UNPAIRED_DETAIL;
    useCloudStatus.setState({ phase: "local", detail });
    return;
  }
  if (failure.reason === "no-address") {
    useCloudStatus.setState({ phase: "local", detail: "חסרה כתובת שרת. אחרי ששומרים אותה צריך גם קישור או קוד QR מהמשרד האחורי." });
    return;
  }
  if (failure.reason === "http" && failure.status) {
    useCloudStatus.setState({ phase: "error", detail: serverErrorDetail(failure.status) });
    return;
  }
  const browserOffline = browserReportsOffline();
  const probeFailed = failure.reason === "network" ? !(await probeCloud()) : true;
  if (shouldReportOffline(failure.reason === "network", browserOffline, probeFailed)) {
    useCloudStatus.setState({ phase: "offline", detail: OFFLINE_DETAIL });
    return;
  }
  useCloudStatus.setState({
    phase: "error",
    detail: failure.status ? serverErrorDetail(failure.status) : unreachableDetail(browserOffline),
  });
}

async function runSync() {
  const token = readSessionToken();
  const pending = () => usePos.getState().outbox.length;
  try {
    if ((blockedToken && token === blockedToken) || (usePos.getState().registerRevoked && !token)) {
      useCloudStatus.setState({ phase: "revoked", detail: REVOKED_DETAIL });
      return;
    }
    useCloudStatus.setState({ phase: "syncing", detail: pending() ? `${pending()} ממתינות` : "" });
    const state = usePos.getState();
    let releaseAt: string | null = null;
    if (!state.cloudCursor) {
      const probe = await pullCloud(null, syncClient());
      releaseAt = releaseStamp(probe.docs);
      const known = new Set(probe.docs.map((doc) => doc.id));
      const now = new Date().toISOString();
      if (!isDemoMode()) {
        state.applyRemote(probe.docs);
        const claimId = probe.register?.businessId ?? "";
        usePos.getState().takePairedBaseline(probe.docs, claimId);
        if (probe.register) {
          const fresh = usePos.getState();
          const extra = pairedBaselineUpload(fresh.stores, fresh.staff, known, probe.register.businessId, now);
          if (extra.length) fresh.replaceOutbox(mergeOutbox(fresh.outbox, extra));
        }
      } else {
        const missing = snapshotDocs(state.stores, state.staff, now).filter((doc) => !known.has(doc.id));
        if (missing.length) state.replaceOutbox(mergeOutbox(state.outbox, missing));
        state.applyRemote(probe.docs);
      }
      requeueCatalogDrift(probe.docs);
      usePos.getState().setCloudCursor(probe.serverTime);
      rememberRegister(probe.register);
    }
    await flushOutbox();
    const pulled = await pullCloud(usePos.getState().cloudCursor, syncClient());
    rememberRegister(pulled.register);
    releaseAt = releaseStamp(pulled.docs) ?? releaseAt;
    usePos.getState().applyRemote(pulled.docs);
    requeueCatalogDrift(pulled.docs);
    usePos.getState().setCloudCursor(pulled.serverTime);
    usePos.getState().acceptCloudClock(pulled.serverTime, releaseAt);
    await flushOutbox();
    const left = usePos.getState().outbox.length;
    useCloudStatus.setState({
      phase: "synced",
      detail: left ? `${left} עדיין ממתינות להעלאה` : "הכל בענן",
    });
  } catch (error) {
    await reportFailure(error);
  } finally {
    useCloudStatus.setState((current) => ({ attempt: current.attempt + 1 }));
  }
}

export async function syncNow(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    do {
      queued = false;
      await runSync();
    } while (queued);
  } finally {
    running = false;
  }
}
