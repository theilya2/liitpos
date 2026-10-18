import type { CloudDoc } from "@/lib/pos/docs";
import { isNativeApp, readCloudUrl, readSessionToken } from "@/lib/pos/native";
import { readRegisterClaim, type RegisterClaim } from "@/lib/pos/register";

type PullResult = { docs: CloudDoc[]; serverTime: string; register: RegisterClaim | null };
type PushResult = { accepted: string[]; skipped: string[]; register: RegisterClaim | null };

export type SyncFailureReason = "unpaired" | "revoked" | "no-address" | "http" | "network";

export type SyncClient = { appVersion: string; pending: number };

export type SyncFailure = Error & { status: number; reason: SyncFailureReason };

function syncFailure(message: string, status: number, reason: SyncFailureReason): SyncFailure {
  const error = new Error(message) as SyncFailure;
  error.status = status;
  error.reason = reason;
  return error;
}

function syncEndpoint(): string {
  const cloud = readCloudUrl();
  if (cloud) return `${cloud}/api/pos/sync`;
  if (isNativeApp()) return "";
  return "/api/pos/sync";
}

/** no-cors GET: resolves when the host answers, rejects when the radio cannot. */
export async function probeCloud(timeoutMs = 4000): Promise<boolean> {
  const cloud = readCloudUrl();
  const target = cloud || (typeof location !== "undefined" && location.origin !== "null" ? location.origin : "");
  if (!target) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(target, { method: "GET", mode: "no-cors", cache: "no-store", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function devicePost<T extends { register?: unknown }>(body: unknown): Promise<T & { register: RegisterClaim | null }> {
  const token = readSessionToken();
  const endpoint = syncEndpoint();
  if (!token) throw syncFailure("Unauthorized", 401, "unpaired");
  if (!endpoint) throw syncFailure("Missing cloud address", 0, "no-address");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const failure = syncFailure("Failed to fetch", 0, "network");
    failure.cause = error;
    throw failure;
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.status === 401 && payload?.error === "revoked") throw syncFailure("revoked", 401, "revoked");
  if (response.status === 401) throw syncFailure("Unauthorized", 401, "unpaired");
  if (!response.ok || !payload) throw syncFailure("sync failed", response.status, "http");
  return { ...payload, register: readRegisterClaim(payload.register) };
}

export async function pullCloud(since: string | null, client?: SyncClient): Promise<PullResult> {
  return devicePost<PullResult>({ op: "pull", since, client });
}

export async function pushCloud(docs: CloudDoc[], client?: SyncClient): Promise<PushResult> {
  return devicePost<PushResult>({ op: "push", docs, client });
}
