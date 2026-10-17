import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUserId, UnauthorizedError } from "@/lib/auth/verify.server";
import { bearerFrom, withCors } from "@/lib/pos/http.server";

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
          const userId = await requireUserId(bearer);
          const { acceptedCloudDocs, pullDocsForUser, pushDocsForUser } = await import("@/lib/pos/cloud.server");
          const body = (await request.json()) as { op?: unknown; since?: unknown; docs?: unknown };
          if (body.op === "pull") {
            const since = body.since === null || typeof body.since === "string" ? body.since : null;
            return json(request, await pullDocsForUser(userId, since));
          }
          if (body.op === "push" && Array.isArray(body.docs) && body.docs.length <= 20) {
            return json(request, await pushDocsForUser(userId, acceptedCloudDocs(body.docs)));
          }
          return json(request, { error: "בקשה לא תקינה" }, 400);
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
