import { formatActivationCode } from "@/lib/pos/activation";
import { deviceModel, isNativeApp, nativeVersion, readCloudUrl, readDeviceId } from "@/lib/pos/native";

export type ActivationPoll =
  | { status: "pending"; code: string }
  | { status: "approved"; token?: string }
  | { status: "rejected" }
  | { status: "expired" }
  | { status: "none" }
  | { status: "offline" }
  | { status: "error"; detail: string };

function endpoint(path: string): string {
  const cloud = readCloudUrl();
  if (cloud) return `${cloud}${path}`;
  if (isNativeApp()) return "";
  return path;
}

function appVersion(): string {
  const version = nativeVersion();
  return version.versionName || (isNativeApp() ? String(version.versionCode || "android") : "web");
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null; offline: boolean }> {
  const url = endpoint(path);
  if (!url) return { ok: false, status: 0, payload: null, offline: true };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, payload, offline: false };
  } catch {
    return { ok: false, status: 0, payload: null, offline: true };
  }
}

export async function requestActivationCode(deviceId = readDeviceId()): Promise<{ code: string } | { error: string; offline: boolean }> {
  const result = await post("/api/pos/activation/request", {
    deviceId,
    model: deviceModel(),
    appVersion: appVersion().slice(0, 40),
  });
  if (result.offline) return { error: "אין רשת. הקוד יופיע כשהחיבור יחזור.", offline: true };
  const code = typeof result.payload?.code === "string" ? formatActivationCode(result.payload.code) : "";
  if (result.ok && code) return { code };
  const error = typeof result.payload?.error === "string" ? result.payload.error : "לא הצלחנו להפיק קוד הפעלה.";
  return { error, offline: false };
}

export async function pollActivation(deviceId: string, stored = false): Promise<ActivationPoll> {
  const result = await post("/api/pos/activation/poll", { deviceId, stored });
  if (result.offline) return { status: "offline" };
  if (!result.ok || !result.payload) {
    const detail = typeof result.payload?.error === "string" ? result.payload.error : "לא הצלחנו לבדוק את האישור.";
    return { status: "error", detail };
  }
  const status = result.payload.status;
  if (status === "pending" && typeof result.payload.code === "string") {
    return { status: "pending", code: formatActivationCode(result.payload.code) };
  }
  if (status === "approved") {
    const token = typeof result.payload.token === "string" ? result.payload.token : "";
    return token ? { status: "approved", token } : { status: "approved" };
  }
  if (status === "rejected" || status === "expired" || status === "none") return { status };
  return { status: "error", detail: "תשובה לא מוכרת מהשרת." };
}
