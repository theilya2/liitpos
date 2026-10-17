import type { CloudDoc } from "@/lib/pos/docs";
import { isNativeApp, readCloudUrl, readSessionToken } from "@/lib/pos/native";

type PullResult = { docs: CloudDoc[]; serverTime: string };
type PushResult = { accepted: string[]; skipped: string[] };

function unauthorized(): Error {
  const error = new Error("Unauthorized") as Error & { status: number };
  error.status = 401;
  return error;
}

function syncEndpoint(): string {
  const cloud = readCloudUrl();
  if (cloud) return `${cloud}/api/pos/sync`;
  if (isNativeApp()) return "";
  return "/api/pos/sync";
}

async function devicePost<T>(body: unknown): Promise<T> {
  const token = readSessionToken();
  const endpoint = syncEndpoint();
  if (!token || !endpoint) throw unauthorized();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (response.status === 401) throw unauthorized();
  if (!response.ok) throw new Error("sync failed");
  return (await response.json()) as T;
}

export async function pullCloud(since: string | null): Promise<PullResult> {
  return devicePost<PullResult>({ op: "pull", since });
}

export async function pushCloud(docs: CloudDoc[]): Promise<PushResult> {
  return devicePost<PushResult>({ op: "push", docs });
}
