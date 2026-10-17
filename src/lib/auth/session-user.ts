/** Fields copied off a Better Auth session, when the payload really is one. */
export type SessionUserFields = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Read the signed-in user from a session payload.
 *
 * The Android app has no auth server inside the APK. Capacitor answers
 * `/api/auth/get-session` with `index.html` (HTTP 200), so the client can
 * receive an HTML string, or an object with no `user`. Those must mean
 * "not signed in", not a crash on `.id`.
 */
export function userFromSession(data: unknown): SessionUserFields | null {
  if (!data || typeof data !== "object") return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const record = user as { id?: unknown; name?: unknown; email?: unknown; image?: unknown };
  if (typeof record.id !== "string" || !record.id) return null;
  return {
    id: record.id,
    name: text(record.name),
    email: text(record.email),
    image: text(record.image),
  };
}
