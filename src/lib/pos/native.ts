import { isDeviceId } from "@/lib/pos/activation";
import { DEFAULT_CLOUD_ORIGIN } from "@/lib/pos/register";

const CLOUD_KEY = "liitpos-cloud-url";
const TOKEN_KEY = "grok-auth.bearer-token";
const DEVICE_KEY = "liitpos-device-id";
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
  setSessionToken?: (token: string) => void;
  getDeviceId?: () => string;
  setDeviceId?: (id: string) => void;
  getDeviceModel?: () => string;
  getVersionCode?: () => number;
  getVersionName?: () => string;
  openExternal?: (url: string) => void;
  printReceipt?: () => void;
  listUsbPrinters?: () => string;
  printReceiptUsb?: (json: string) => void;
  requestUsbPermission?: (deviceName: string) => void;
  pulseDrawerUsb?: (json: string) => void;
  shareCachedFile?: (name: string, base64: string, mime: string, text: string, title: string) => void;
  sendSms?: (number: string, body: string) => void;
  setLockTask?: (enabled: boolean) => void;
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
  if (typeof window !== "undefined") {
    try {
      const saved = cleanCloudUrl(window.localStorage.getItem(CLOUD_KEY) ?? "");
      if (saved) return saved;
    } catch {
      /* private mode */
    }
  }
  return isNativeApp() ? DEFAULT_CLOUD_ORIGIN : "";
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
    return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function persistToken(token: string) {
  bridge()?.setSessionToken?.(token);
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* private mode */
  }
}

function rememberToken(token: string) {
  if (!token) return;
  persistToken(token);
}

/** Keep the license on the device. Native prefs survive an app update; storage covers the browser. */
export function writeSessionToken(token: string): void {
  persistToken(token);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("liitpos-session"));
}

export function clearSessionToken(): void {
  persistToken("");
  if (typeof window !== "undefined") window.dispatchEvent(new Event("liitpos-session"));
}

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function rememberDeviceId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Stable id for this register. Created once, then kept in native prefs and local storage. */
export function readDeviceId(preferred = ""): string {
  const fromBridge = (bridge()?.getDeviceId?.() ?? "").trim();
  if (isDeviceId(fromBridge)) {
    rememberDeviceId(fromBridge);
    return fromBridge;
  }
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(DEVICE_KEY) ?? "";
      if (isDeviceId(saved)) {
        bridge()?.setDeviceId?.(saved);
        return saved;
      }
    } catch {
      /* private mode */
    }
  }
  const next = isDeviceId(preferred) ? preferred : newDeviceId();
  rememberDeviceId(next);
  bridge()?.setDeviceId?.(next);
  return next;
}

export function deviceModel(): string {
  const fromBridge = bridge()?.getDeviceModel?.() ?? "";
  if (fromBridge.trim()) return fromBridge.trim().slice(0, 80);
  if (typeof navigator === "undefined") return "";
  return (navigator.userAgent || "").replace(/\s+/g, " ").trim().slice(0, 80);
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

export function hasUsbPrint(): boolean {
  return typeof bridge()?.printReceiptUsb === "function";
}

export function listUsbPrintersRaw(): string {
  return bridge()?.listUsbPrinters?.() ?? "[]";
}

export function printReceiptUsb(json: string) {
  bridge()?.printReceiptUsb?.(json);
}

export function requestUsbPermission(deviceName: string) {
  bridge()?.requestUsbPermission?.(deviceName);
}

export function pulseDrawerUsb(json: string) {
  bridge()?.pulseDrawerUsb?.(json);
}

export function shareCachedFile(name: string, base64: string, mime: string, text: string, title: string) {
  bridge()?.shareCachedFile?.(name, base64, mime, text, title);
}

export function sendSms(number: string, body: string) {
  bridge()?.sendSms?.(number, body);
}

export function setKioskLock(enabled: boolean) {
  bridge()?.setLockTask?.(enabled);
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
