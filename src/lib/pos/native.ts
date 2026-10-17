const CLOUD_KEY = "liitpos-cloud-url";
const TOKEN_KEY = "grok-auth.bearer-token";
const UPDATE_REPO = "theilya2/Liitpos";

export type AppUpdate = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes: string;
};

type NativeBridge = {
  getCloudUrl?: () => string;
  setCloudUrl?: (url: string) => void;
  getSessionToken?: () => string;
  getVersionCode?: () => number;
  getVersionName?: () => string;
  openExternal?: (url: string) => void;
  printReceipt?: () => void;
  downloadAndInstall?: (url: string, token: string) => void;
  checkUpdate?: (cloudUrl: string) => string;
};

type NativeWindow = Window & {
  LiitposNative?: NativeBridge;
  __liitposApplySession?: () => void;
};

function bridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as NativeWindow).LiitposNative ?? null;
}

export function isNativeApp(): boolean {
  return bridge() !== null;
}

export function cleanCloudUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !local) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function readCloudUrl(): string {
  const fromBridge = cleanCloudUrl(bridge()?.getCloudUrl?.() ?? "");
  if (fromBridge) return fromBridge;
  if (typeof window === "undefined") return "";
  try {
    return cleanCloudUrl(window.localStorage.getItem(CLOUD_KEY) ?? "");
  } catch {
    return "";
  }
}

export function writeCloudUrl(value: string): string {
  const url = cleanCloudUrl(value);
  bridge()?.setCloudUrl?.(url);
  if (typeof window !== "undefined") {
    try {
      if (url) window.localStorage.setItem(CLOUD_KEY, url);
      else window.localStorage.removeItem(CLOUD_KEY);
    } catch {
      /* private mode */
    }
  }
  return url;
}

export function readSessionToken(): string {
  const fromBridge = bridge()?.getSessionToken?.() ?? "";
  if (fromBridge) return fromBridge;
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberToken(token: string) {
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function nativeVersion(): { versionCode: number; versionName: string } {
  return {
    versionCode: Number(bridge()?.getVersionCode?.() ?? 0) || 0,
    versionName: bridge()?.getVersionName?.() ?? "",
  };
}

export function openExternal(url: string) {
  const native = bridge();
  if (native?.openExternal) {
    native.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

export function printNative() {
  const native = bridge();
  if (native?.printReceipt) native.printReceipt();
  else window.print();
}

export function installUpdate(update: AppUpdate) {
  bridge()?.downloadAndInstall?.(update.apkUrl, "");
}

export function prepareNative(): void {
  if (typeof window === "undefined" || !bridge()) return;
  const token = bridge()?.getSessionToken?.() ?? "";
  if (token) rememberToken(token);
  const cloud = readCloudUrl();
  if (cloud) writeCloudUrl(cloud);
  const nativePrint = bridge()?.printReceipt;
  if (nativePrint) {
    window.print = () => nativePrint();
  }
  (window as NativeWindow).__liitposApplySession = () => {
    const next = bridge()?.getSessionToken?.() ?? "";
    if (next) rememberToken(next);
    const url = readCloudUrl();
    if (url) writeCloudUrl(url);
    window.dispatchEvent(new Event("liitpos-session"));
  };
}

function asUpdate(value: unknown): AppUpdate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { versionCode?: unknown; versionName?: unknown; apkUrl?: unknown; notes?: unknown };
  const versionCode = Number(raw.versionCode);
  const apkUrl = typeof raw.apkUrl === "string" ? raw.apkUrl : "";
  if (!Number.isInteger(versionCode) || versionCode <= 0 || !apkUrl.startsWith("https://")) return null;
  return {
    versionCode,
    versionName: typeof raw.versionName === "string" ? raw.versionName : String(versionCode),
    apkUrl,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 280) : "",
  };
}

export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (!isNativeApp()) return null;
  const current = nativeVersion().versionCode;
  const raw = bridge()?.checkUpdate?.(readCloudUrl()) ?? "";
  if (!raw) return null;
  try {
    const parsed = asUpdate(JSON.parse(raw) as unknown);
    if (!parsed || parsed.versionCode <= current) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const UPDATE_REPOSITORY = UPDATE_REPO;
