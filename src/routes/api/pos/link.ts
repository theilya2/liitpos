import { createFileRoute } from "@tanstack/react-router";

function page(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Liitpos</title></head><body style="font-family:sans-serif;padding:24px;line-height:1.5">${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function cookieValue(request: Request, name: string): string {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export const Route = createFileRoute("/api/pos/link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { SESSION_TOKEN_COOKIE } = await import("@/lib/auth/server");
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        if (!user) {
          return page(`<h1>צריך להיכנס לחשבון</h1><p>אחרי הכניסה האפליקציה בטלפון תתחבר לענן.</p><p><a href="/login?next=${encodeURIComponent("/api/pos/link")}">כניסה</a></p>`);
        }
        const token = cookieValue(request, SESSION_TOKEN_COOKIE);
        if (!token) return page("<h1>אין מזהה כניסה</h1><p>נסו להתחבר שוב.</p>", 401);
        const cloud = new URL(request.url).origin;
        const target = `liitpos://link?token=${encodeURIComponent(token)}&cloud=${encodeURIComponent(cloud)}`;
        return page(`<h1>הטלפון מחובר</h1><p>אפשר לחזור לאפליקציית Liitpos. המכירות שנשמרו בלי רשת יעלו לענן.</p><p><a href="${target}">פתיחת Liitpos</a></p><script>location.replace(${JSON.stringify(target)})</script>`);
      },
    },
  },
});
