import { createFileRoute } from "@tanstack/react-router";
import { clientIp } from "@/lib/auth/admin.server";
import { withCors } from "@/lib/pos/http.server";

function json(request: Request, body: unknown, status = 200) {
  return withCors(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
  );
}

export const Route = createFileRoute("/api/pos/activation/request")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(request, new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { deviceId?: unknown; model?: unknown; appVersion?: unknown; sources?: unknown };
          const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
          const model = typeof body.model === "string" ? body.model : "";
          const appVersion = typeof body.appVersion === "string" ? body.appVersion : "";
          const sources = Array.isArray(body.sources)
            ? body.sources.slice(0, 3).flatMap((item) => {
                if (!item || typeof item !== "object") return [];
                const source = "source" in item && typeof item.source === "string" ? item.source : "";
                const id = "deviceId" in item && typeof item.deviceId === "string" ? item.deviceId : "";
                return [{ source, deviceId: id }];
              })
            : [];
          const { requestActivation } = await import("@/lib/pos/activation.server");
          const result = await requestActivation({ deviceId, sources, model, appVersion, ip: clientIp(request) });
          if (!result.ok) return json(request, { error: result.error }, result.status);
          return json(request, { code: result.code, source: result.source, deviceId: result.deviceId });
        } catch (error) {
          console.error("[activation-request]", error);
          return json(request, { error: "לא הצלחנו להפיק קוד הפעלה." }, 500);
        }
      },
    },
  },
});
