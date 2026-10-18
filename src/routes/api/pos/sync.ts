import { createFileRoute } from "@tanstack/react-router";
import { markRegisterSynced, openDeviceSession } from "@/lib/auth/admin.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { UnauthorizedError } from "@/lib/auth/verify.server";
import { bearerFrom, withCors } from "@/lib/pos/http.server";
import type { RegisterClaim } from "@/lib/pos/register";

function clientOf(body: { client?: unknown }): { appVersion: string; pending: number } {
  const raw = body.client;
  if (!raw || typeof raw !== "object") return { appVersion: "", pending: 0 };
  const record = raw as { appVersion?: unknown; pending?: unknown };
  const appVersion = typeof record.appVersion === "string" ? record.appVersion.trim().slice(0, 40) : "";
  const pending = Number(record.pending);
  return {
    appVersion,
    pending: Number.isFinite(pending) && pending >= 0 ? Math.min(9999, Math.floor(pending)) : 0,
  };
}

function json(request: Request, body: unknown, status = 200) {
  return withCors(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  );
}

export const Route = createFileRoute("/api/pos/sync")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(request, new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        try {
          const bearer = bearerFrom(request);
          if (!bearer) assertSameSiteRequest();
          const body = (await request.json()) as { op?: unknown; since?: unknown; docs?: unknown; client?: unknown };
          const session = bearer
            ? await openDeviceSession(bearer, clientOf(body))
            : { status: "unauthorized" as const, ownerId: "", register: null as RegisterClaim | null, registerId: null };
          if (session.status === "revoked") return json(request, { error: "revoked" }, 401);
          if (session.status !== "ok") return json(request, { error: "Unauthorized" }, 401);
          const userId = session.ownerId;
          const register = session.register;
          const { acceptedCloudDocs, pullDocsForUser, pushDocsForUser } = await import("@/lib/pos/cloud.server");
          let payload: unknown = null;
          if (body.op === "pull") {
            const since = body.since === null || typeof body.since === "string" ? body.since : null;
            payload = { ...(await pullDocsForUser(userId, since)), register };
          } else if (body.op === "push" && Array.isArray(body.docs) && body.docs.length <= 20) {
            payload = { ...(await pushDocsForUser(userId, acceptedCloudDocs(body.docs))), register };
          }
          if (!payload) return json(request, { error: "בקשה לא תקינה" }, 400);
          if (session.registerId) await markRegisterSynced(session.registerId);
          return json(request, payload);
        } catch (error) {
          if (error instanceof UnauthorizedError || (error instanceof Error && error.message === "Unauthorized")) {
            return json(request, { error: "Unauthorized" }, 401);
          }
          if (error instanceof Error && error.message === "Forbidden: cross-site request blocked") {
            return json(request, { error: "Forbidden" }, 403);
          }
          console.error("[pos-sync]", error);
          return json(request, { error: "sync failed" }, 500);
        }
      },
    },
  },
});
