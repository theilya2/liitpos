import {
  activationMaterial,
  chooseActivationSource,
  codeFromDeviceHash,
  formatActivationCode,
  isActivationSource,
  isDeviceId,
  normalizeActivationCode,
  type ActivationSource,
  type ReportedIdentity,
} from "@/lib/pos/activation";
import { DEFAULT_CLOUD_ORIGIN } from "@/lib/pos/register";
import { readUpdateEvent, UPDATE_EVENT, type UpdateNotice } from "@/lib/pos/update-event";

const CLOUD_KEY = "liitpos-cloud-url";
const TOKEN_KEY = "grok-auth.bearer-token";
const DEVICE_KEY = "liitpos-device-id";
const ACTIVATION_SEED_KEY = "liitpos-activation-seed";
const ACTIVATION_SOURCE_KEY = "liitpos-activation-source";
const ACTIVATION_CODE_KEY = "liitpos-activation-code";
const ACTIVATION_PRIMARY_KEY = "liitpos-activation-primary";
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
  isDeviceOwner?: () => boolean;
  getHardwareSerial?: () => string;
  getAndroidId?: () => string;
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
  lastUpdateEvent?: () => string;
  checkUpdate?: (cloudUrl: string) => string;
};

type NativeWindow = Window & {
  LiitposNative?: NativeBridge;
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

let memorySeed = "";

function webActivationSeed(): string {
  if (typeof window === "undefined") return memorySeed || "anonymous";
  try {
    const saved = window.localStorage.getItem(ACTIVATION_SEED_KEY) ?? "";
    if (saved) return saved;
    const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `web_${Date.now()}`;
    window.localStorage.setItem(ACTIVATION_SEED_KEY, next);
    memorySeed = next;
    return next;
  } catch {
    if (!memorySeed) memorySeed = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `web_${Date.now()}`;
    return memorySeed;
  }
}

function storedText(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function storeText(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanNative(value: string | undefined): string {
  return (value ?? "").replace(/[\r\n]/g, "").trim();
}

export type ActivationIdentity = {
  deviceId: string;
  code: string;
  source: ActivationSource;
  sources: ReportedIdentity[];
};

/** Remember the source that already owns this register so a better id cannot replace the code. */
export function rememberActivationChoice(choice: { source: ActivationSource; deviceId: string; code: string }) {
  storeText(ACTIVATION_SOURCE_KEY, choice.source);
  storeText(ACTIVATION_PRIMARY_KEY, choice.deviceId);
  storeText(ACTIVATION_CODE_KEY, normalizeActivationCode(choice.code) ?? "");
}

/** Permanent activation identity. Device owner prefers the hardware serial, then ANDROID_ID, then a stored random id. */
export async function readActivationIdentity(): Promise<ActivationIdentity> {
  const native = bridge();
  const parts: { source: ActivationSource; value: string }[] = [];
  if (native) {
    const serial = cleanNative(native.getHardwareSerial?.());
    const androidId = cleanNative(native.getAndroidId?.());
    if (serial) parts.push({ source: "serial", value: serial });
    if (androidId) parts.push({ source: "android", value: androidId });
  }
  if (!parts.length) parts.push({ source: "random", value: webActivationSeed() });
  const sources: ReportedIdentity[] = [];
  for (const part of parts) {
    sources.push({ source: part.source, deviceId: await sha256Hex(activationMaterial(part.source, part.value)) });
  }
  const storedSource = isActivationSource(storedText(ACTIVATION_SOURCE_KEY)) ? (storedText(ACTIVATION_SOURCE_KEY) as ActivationSource) : null;
  const source = chooseActivationSource(storedSource, sources.map((item) => item.source));
  const chosen = sources.find((item) => item.source === source) ?? sources[0];
  if (!chosen) return { deviceId: "", code: "", source: "random", sources };
  if (storedSource && source === storedSource) {
    return { deviceId: chosen.deviceId, code: formatActivationCode(codeFromDeviceHash(chosen.deviceId) ?? ""), source, sources };
  }
  const savedCode = formatActivationCode(storedText(ACTIVATION_CODE_KEY));
  const savedPrimary = storedText(ACTIVATION_PRIMARY_KEY).trim().toLowerCase();
  if (storedSource && normalizeActivationCode(savedCode) && savedPrimary) {
    return { deviceId: savedPrimary, code: savedCode, source: storedSource, sources };
  }
  if (!storedSource && source) rememberActivationChoice({ source, deviceId: chosen.deviceId, code: codeFromDeviceHash(chosen.deviceId) ?? "" });
  return { deviceId: chosen.deviceId, code: formatActivationCode(codeFromDeviceHash(chosen.deviceId) ?? ""), source: source ?? chosen.source, sources };
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
  try {
    const native = bridge();
    if (!native?.downloadAndInstall) {
      dispatchUpdate({ phase: "error", percent: null, message: "העדכון לא זמין במכשיר הזה." });
      return;
    }
    native.downloadAndInstall(update.apkUrl, "");
  } catch {
    dispatchUpdate({ phase: "error", percent: null, message: "העדכון נכשל. נסו שוב." });
  }
}

export function dispatchUpdate(notice: UpdateNotice) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: notice }));
}

export function readNativeUpdateEvent(): UpdateNotice | null {
  const raw = bridge()?.lastUpdateEvent?.() ?? "";
  if (!raw) return null;
  try {
    return readUpdateEvent(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
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
