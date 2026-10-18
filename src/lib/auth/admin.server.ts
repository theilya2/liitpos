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
import type { DeviceTokenView } from "./pairing";
import { cleanRegisterName, type RegisterClaim } from "@/lib/pos/register";

export const ADMIN_COOKIE = "liitpos_admin";
const SESSION_SECONDS = 60 * 60 * 12;
const USERNAME_WIDE_IP = "*";

export function adminConfigured(): boolean {
  return credentialsFromEnv(process.env) !== null;
}

export function hashToken(token: string): string {
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

export async function listLegacyTokens(): Promise<DeviceTokenView[]> {
  const sql = await getSql();
  const rows = await sql<{ id: string; label: string; created_at: string; last_seen: string | null; revoked: boolean }>`
    select id, label, created_at::text as created_at, last_seen::text as last_seen, (revoked_at is not null) as revoked
    from device_tokens
    where register_id is null
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

export async function revokeDeviceToken(id: string): Promise<void> {
  const sql = await getSql();
  await sql`update device_tokens set revoked_at = now() where id = ${id} and revoked_at is null`;
}

export type RegisterView = {
  id: string;
  businessId: string;
  number: number;
  name: string;
  revoked: boolean;
  paired: boolean;
  appVersion: string;
  lastSync: string | null;
  lastContact: string | null;
  pendingOutbox: number;
  online: boolean;
};

export type DeviceSession =
  | { status: "ok"; ownerId: string; register: RegisterClaim | null; registerId: string | null }
  | { status: "revoked" }
  | { status: "unauthorized" };

export async function listRegisters(): Promise<RegisterView[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    business_id: string;
    register_no: number;
    name: string;
    revoked: boolean;
    paired: boolean;
    app_version: string;
    last_sync: string | null;
    last_contact: string | null;
    pending_outbox: number;
    online: boolean;
  }>`
    select
      r.id,
      r.business_id,
      r.register_no,
      r.name,
      (r.revoked_at is not null) as revoked,
      exists (
        select 1 from device_tokens t
        where t.register_id = r.id and t.revoked_at is null
      ) as paired,
      r.app_version,
      r.last_sync::text as last_sync,
      (
        select max(t.last_seen)::text from device_tokens t where t.register_id = r.id
      ) as last_contact,
      r.pending_outbox,
      (
        r.revoked_at is null
        and exists (
          select 1 from device_tokens t
          where t.register_id = r.id and t.last_seen is not null and t.last_seen > now() - interval '2 minutes'
        )
      ) as online
    from registers r
    order by r.business_id, r.register_no
  `;
  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    number: Number(row.register_no),
    name: row.name ?? "",
    revoked: asBool(row.revoked),
    paired: asBool(row.paired),
    appVersion: row.app_version ?? "",
    lastSync: row.last_sync,
    lastContact: row.last_contact,
    pendingOutbox: Number(row.pending_outbox) || 0,
    online: asBool(row.online),
  }));
}

export async function renameRegister(id: string, name: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update registers set name = ${cleanRegisterName(name)} where id = ${id} returning id
  `;
  if (!rows[0]?.id) throw new Error("הקופה לא נמצאה.");
}

export async function revokeRegister(id: string): Promise<void> {
  const sql = await getSql();
  await sql`update registers set revoked_at = now() where id = ${id} and revoked_at is null`;
  await sql`update device_tokens set revoked_at = now() where register_id = ${id} and revoked_at is null`;
}

export async function markRegisterSynced(registerId: string): Promise<void> {
  if (!registerId) return;
  const sql = await getSql();
  await sql`update registers set last_sync = now() where id = ${registerId} and revoked_at is null`;
}

export async function openDeviceSession(token: string, client: { appVersion: string; pending: number }): Promise<DeviceSession> {
  if (!token) return { status: "unauthorized" };
  const sql = await getSql();
  const rows = await sql<{ id: string; revoked_at: string | null; register_id: string | null }>`
    update device_tokens
    set last_seen = now()
    where token_hash = ${hashToken(token)}
    returning id, revoked_at::text as revoked_at, register_id
  `;
  const row = rows[0];
  if (!row) return { status: "unauthorized" };
  if (row.revoked_at) return { status: "revoked" };
  if (!row.register_id) return { status: "ok", ownerId: OWNER_ID, register: null, registerId: null };
  const registers = await sql<{ business_id: string; register_no: number; name: string; revoked_at: string | null }>`
    update registers
    set app_version = ${client.appVersion},
        pending_outbox = ${client.pending}
    where id = ${row.register_id} and revoked_at is null
    returning business_id, register_no, name, revoked_at::text as revoked_at
  `;
  const register = registers[0];
  if (!register) return { status: "revoked" };
  return {
    status: "ok",
    ownerId: OWNER_ID,
    registerId: row.register_id,
    register: { number: Number(register.register_no), name: register.name ?? "", businessId: register.business_id },
  };
}
