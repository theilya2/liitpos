import type { CloudDoc } from "@/lib/pos/docs";
import { isNativeApp, readCloudUrl, readSessionToken } from "@/lib/pos/native";

type PullResult = { docs: CloudDoc[]; serverTime: string };
type PushResult = { accepted: string[]; skipped: string[] };

export type SyncFailureReason = "unpaired" | "no-address" | "http" | "network";

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

async function devicePost<T>(body: unknown): Promise<T> {
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
  if (response.status === 401) throw syncFailure("Unauthorized", 401, "unpaired");
  if (!response.ok) throw syncFailure("sync failed", response.status, "http");
  return (await response.json()) as T;
}

export async function pullCloud(since: string | null): Promise<PullResult> {
  return devicePost<PullResult>({ op: "pull", since });
}

export async function pushCloud(docs: CloudDoc[]): Promise<PushResult> {
  return devicePost<PushResult>({ op: "push", docs });
}
