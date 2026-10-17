import { pullDocs, pushDocs } from "@/lib/pos/cloud.functions";
import type { CloudDoc } from "@/lib/pos/docs";
import { isNativeApp, readCloudUrl, readSessionToken } from "@/lib/pos/native";

type PullResult = { docs: CloudDoc[]; serverTime: string };
type PushResult = { accepted: string[]; skipped: string[] };

function unauthorized(): Error {
  const error = new Error("Unauthorized") as Error & { status: number };
  error.status = 401;
  return error;
}

async function nativePost<T>(body: unknown): Promise<T> {
  const cloud = readCloudUrl();
  const token = readSessionToken();
  if (!cloud || !token) throw unauthorized();
  const response = await fetch(`${cloud}/api/pos/sync`, {
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
  if (isNativeApp()) return nativePost<PullResult>({ op: "pull", since });
  return pullDocs({ data: { since } });
}

export async function pushCloud(docs: CloudDoc[]): Promise<PushResult> {
  if (isNativeApp()) return nativePost<PushResult>({ op: "push", docs });
  return pushDocs({ data: { docs } });
}
