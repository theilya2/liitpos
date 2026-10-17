import { createFileRoute } from "@tanstack/react-router";
import { logoutAdmin } from "@/lib/auth/admin.server";

export const Route = createFileRoute("/api/admin/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const cookie = await logoutAdmin(request);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "set-cookie": cookie,
            },
          });
        } catch (error) {
          console.error("[admin-logout]", error);
          return new Response(JSON.stringify({ error: "היציאה לא הושלמה." }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
      },
    },
  },
});
