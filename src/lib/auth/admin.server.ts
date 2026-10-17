import { createHash, randomBytes } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import {
  LOGIN_FAIL_LIMIT,
  credentialsAccept,
  credentialsFromEnv,
  type AdminCredentials,
} from "./admin-credentials";
import { OWNER_ID } from "./owner";
import { pairingLink, type DeviceTokenView } from "./pairing";

export const ADMIN_COOKIE = "liitpos_admin";
const SESSION_SECONDS = 60 * 60 * 12;
const USERNAME_WIDE_IP = "*";

export function adminConfigured(): boolean {
  return credentialsFromEnv(process.env) !== null;
}

export function cloudOrigin(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ?? "";
  if (/^https?:\/\//i.test(configured)) return configured;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const raw = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return raw.slice(0, 80) || "unknown";
}

function attemptKey(username: string): string {
  return username.trim().toLowerCase().slice(0, 80) || "unknown";
}

export function cookieValue(header: string | null, name: string): string {
  const raw = header ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function sessionCookie(token: string, secure: boolean, maxAge = SESSION_SECONDS): string {
  const parts = [`${ADMIN_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestIsSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "t" || value === "true";
}

type AttemptRow = { failures: number; locked: boolean };

async function readAttempt(ip: string, username: string): Promise<AttemptRow> {
  const sql = await getSql();
  const rows = await sql<AttemptRow>`
    select failures, (locked_until is not null and locked_until > now()) as locked
    from login_attempts
    where ip = ${ip} and username = ${username}
  `;
  const row = rows[0];
  return { failures: Number(row?.failures ?? 0), locked: asBool(row?.locked) };
}

async function writeAttempt(ip: string, username: string, failures: number, lock: boolean): Promise<void> {
  const sql = await getSql();
  if (lock) {
    await sql`
      insert into login_attempts (ip, username, failures, locked_until, updated_at)
      values (${ip}, ${username}, ${failures}, now() + interval '15 minutes', now())
      on conflict (ip, username) do update set
        failures = excluded.failures,
        locked_until = excluded.locked_until,
        updated_at = now()
    `;
    return;
  }
  await sql`
    insert into login_attempts (ip, username, failures, locked_until, updated_at)
    values (${ip}, ${username}, ${failures}, null, now())
    on conflict (ip, username) do update set
      failures = excluded.failures,
      locked_until = null,
      updated_at = now()
  `;
}

async function clearAttempts(ip: string, username: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from login_attempts where username = ${username} and ip in (${ip}, ${USERNAME_WIDE_IP})`;
}

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; status: 401 | 429 | 503; error: string };

export async function loginAdmin(request: Request, username: string, password: string): Promise<LoginResult> {
  const creds: AdminCredentials | null = credentialsFromEnv(process.env);
  if (!creds) return { ok: false, status: 503, error: "הכניסה לא הוגדרה." };
  const ip = clientIp(request);
  const name = attemptKey(username);
  const [byIp, byName] = await Promise.all([readAttempt(ip, name), readAttempt(USERNAME_WIDE_IP, name)]);
  if (byIp.locked || byName.locked) return { ok: false, status: 429, error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה." };
  const accepted = credentialsAccept(username, password, creds);
  if (!accepted) {
    const ipNext = byIp.failures + 1;
    const nameNext = byName.failures + 1;
    await writeAttempt(ip, name, ipNext, ipNext >= LOGIN_FAIL_LIMIT);
    await writeAttempt(USERNAME_WIDE_IP, name, nameNext, nameNext >= LOGIN_FAIL_LIMIT);
    return { ok: false, status: 401, error: "הכניסה נדחתה." };
  }
  await clearAttempts(ip, name);
  const token = randomBytes(32).toString("base64url");
  const sql = await getSql();
  await sql`
    insert into admin_sessions (token_hash, expires_at)
    values (${hashToken(token)}, now() + interval '12 hours')
  `;
  return { ok: true, cookie: sessionCookie(token, requestIsSecure(request)) };
}

export async function sessionIsLive(token: string): Promise<boolean> {
  if (!token || !adminConfigured()) return false;
  const sql = await getSql();
  const rows = await sql<{ ok: boolean }>`
    select true as ok from admin_sessions
    where token_hash = ${hashToken(token)} and expires_at > now()
  `;
  return Boolean(rows[0]?.ok);
}

export async function adminFromRequest(request: Request): Promise<boolean> {
  const token = cookieValue(request.headers.get("cookie"), ADMIN_COOKIE);
  return sessionIsLive(token);
}

export async function requireAdminSession(): Promise<void> {
  if (!adminConfigured()) throw new Error("Unauthorized");
  const token = getCookie(ADMIN_COOKIE) ?? "";
  if (!(await sessionIsLive(token))) throw new Error("Unauthorized");
}

export async function logoutAdmin(request: Request): Promise<string> {
  const token = cookieValue(request.headers.get("cookie"), ADMIN_COOKIE);
  if (token) {
    const sql = await getSql();
    await sql`delete from admin_sessions where token_hash = ${hashToken(token)}`;
  }
  return sessionCookie("", requestIsSecure(request), 0);
}

export async function ownerForDeviceToken(token: string): Promise<string | null> {
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update device_tokens
    set last_seen = now()
    where token_hash = ${hashToken(token)} and revoked_at is null
    returning id
  `;
  return rows[0]?.id ? OWNER_ID : null;
}

export async function listDeviceTokens(): Promise<DeviceTokenView[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string; label: string; created_at: string; last_seen: string | null; revoked: boolean }>`
    select id, label, created_at::text as created_at, last_seen::text as last_seen, (revoked_at is not null) as revoked
    from device_tokens
    order by created_at desc
    limit 50
  `;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    revoked: asBool(row.revoked),
  }));
}

export async function createDeviceToken(request: Request, label: string): Promise<{ id: string; label: string; link: string }> {
  const token = randomBytes(32).toString("base64url");
  const id = `dev_${randomBytes(8).toString("hex")}`;
  const sql = await getSql();
  await sql`
    insert into device_tokens (id, token_hash, label)
    values (${id}, ${hashToken(token)}, ${label})
  `;
  return { id, label, link: pairingLink(token, cloudOrigin(request)) };
}

export async function revokeDeviceToken(id: string): Promise<void> {
  const sql = await getSql();
  await sql`update device_tokens set revoked_at = now() where id = ${id} and revoked_at is null`;
}
