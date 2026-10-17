import { createFileRoute } from "@tanstack/react-router";
import { loginAdmin } from "@/lib/auth/admin.server";

function json(body: unknown, status: number, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let username = "";
        let password = "";
        try {
          const body = (await request.json()) as { username?: unknown; password?: unknown };
          if (typeof body.username !== "string" || typeof body.password !== "string") return json({ error: "בקשה לא תקינה" }, 400);
          username = body.username;
          password = body.password;
        } catch {
          return json({ error: "בקשה לא תקינה" }, 400);
        }
        try {
          const result = await loginAdmin(request, username.slice(0, 80), password.slice(0, 200));
          if (!result.ok) return json({ error: result.error }, result.status);
          return json({ ok: true }, 200, result.cookie);
        } catch (error) {
          console.error("[admin-login]", error);
          return json({ error: "הכניסה לא נשמרה." }, 500);
        }
      },
    },
  },
});
