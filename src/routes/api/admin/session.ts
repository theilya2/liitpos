import { createFileRoute } from "@tanstack/react-router";
import { adminFromRequest } from "@/lib/auth/admin.server";

export const Route = createFileRoute("/api/admin/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ok = await adminFromRequest(request);
          return new Response(JSON.stringify({ ok }), {
            status: ok ? 200 : 401,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          });
        } catch (error) {
          console.error("[admin-session]", error);
          return new Response(JSON.stringify({ ok: false }), {
            status: 401,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
