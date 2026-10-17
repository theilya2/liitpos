import { create } from "zustand";
import { pullDocs, pushDocs } from "@/lib/pos/cloud.functions";
import { mergeOutbox, snapshotDocs, type CloudDoc } from "@/lib/pos/docs";
import { usePos } from "@/lib/pos/store";

export type CloudPhase = "checking" | "offline" | "local" | "syncing" | "synced" | "error";

type CloudView = {
  phase: CloudPhase;
  detail: string;
};

export const useCloudStatus = create<CloudView>(() => ({
  phase: "checking",
  detail: "",
}));

let running = false;

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isUnauthorized(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; message?: string };
  return value.status === 401 || value.message === "Unauthorized";
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

async function flushOutbox() {
  let state = usePos.getState();
  let guard = 0;
  while (state.outbox.length && guard < 8) {
    const batch = state.outbox.slice(0, 20);
    const result = await pushDocs({ data: { docs: batch } });
    const done = new Set([...result.accepted, ...result.skipped]);
    state.ackOutbox(batch.map((doc) => doc.id).filter((id) => done.has(id)));
    state = usePos.getState();
    guard += 1;
  }
}

export async function syncNow(): Promise<void> {
  const pending = () => usePos.getState().outbox.length;
  if (isOffline()) {
    useCloudStatus.setState({ phase: "offline", detail: "המכירות נשמרות במכשיר עד שהרשת חוזרת" });
    return;
  }
  if (running) return;
  running = true;
  useCloudStatus.setState({ phase: "syncing", detail: pending() ? `${pending()} ממתינות` : "" });
  try {
    let state = usePos.getState();
    let releaseAt: string | null = null;
    if (!state.cloudCursor) {
      const probe = await pullDocs({ data: { since: null } });
      releaseAt = releaseStamp(probe.docs);
      const known = new Set(probe.docs.map((doc) => doc.id));
      const missing = snapshotDocs(state.stores, state.staff, new Date().toISOString()).filter((doc) => !known.has(doc.id));
      if (missing.length) state.replaceOutbox(mergeOutbox(state.outbox, missing));
      state.applyRemote(probe.docs);
      state.setCloudCursor(probe.serverTime);
    }
    await flushOutbox();
    const pulled = await pullDocs({ data: { since: usePos.getState().cloudCursor } });
    releaseAt = releaseStamp(pulled.docs) ?? releaseAt;
    usePos.getState().applyRemote(pulled.docs);
    usePos.getState().setCloudCursor(pulled.serverTime);
    usePos.getState().acceptCloudClock(pulled.serverTime, releaseAt);
    await flushOutbox();
    const left = usePos.getState().outbox.length;
    useCloudStatus.setState({
      phase: left ? "synced" : "synced",
      detail: left ? `${left} עדיין ממתינות להעלאה` : "הכל בענן",
    });
  } catch (error) {
    if (isUnauthorized(error)) {
      useCloudStatus.setState({ phase: "local", detail: "בלי חשבון העסקאות נשארות במכשיר" });
    } else if (isOffline()) {
      useCloudStatus.setState({ phase: "offline", detail: "המכירות נשמרות במכשיר עד שהרשת חוזרת" });
    } else {
      useCloudStatus.setState({ phase: "error", detail: "הסנכרון לא הצליח. ננסה שוב, והמכירות שמורות במכשיר" });
    }
  } finally {
    running = false;
  }
}
