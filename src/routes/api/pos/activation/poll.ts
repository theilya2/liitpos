import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/api/pos/activation/poll")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(request, new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { deviceId?: unknown; stored?: unknown };
          const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
          const { pollActivation } = await import("@/lib/pos/activation.server");
          const result = await pollActivation(deviceId, body.stored === true);
          if (result.status === "invalid") return json(request, { error: "מזהה מכשיר לא תקין." }, 400);
          return json(request, result);
        } catch (error) {
          console.error("[activation-poll]", error);
          return json(request, { error: "לא הצלחנו לבדוק את האישור." }, 500);
        }
      },
    },
  },
});
