import { randomBytes, randomInt } from "node:crypto";
import { hashToken } from "@/lib/auth/admin.server";
import { getSql } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth/owner";
import {
  ACTIVATION_ALPHABET,
  ACTIVATION_DEVICE_LIMIT,
  ACTIVATION_IP_LIMIT,
  ACTIVATION_TTL_MS,
  ACTIVATION_WINDOW_MS,
  formatActivationCode,
  generateActivationCode,
  isDeviceId,
  nextRateLimit,
  normalizeActivationCode,
} from "@/lib/pos/activation";
import { cleanRegisterName, nextRegisterNo, registerCaption } from "@/lib/pos/register";

export type PendingActivation = {
  id: string;
  code: string;
  model: string;
  appVersion: string;
  requestedAt: string;
};

export type ActivationPoll =
  | { status: "pending"; code: string }
  | { status: "approved"; token?: string }
  | { status: "rejected" }
  | { status: "expired" }
  | { status: "none" };

type ActivationRow = {
  id: string;
  device_id: string;
  code: string;
  model: string;
  app_version: string;
  status: string;
  created_at: string;
  expires_at: string;
  register_id: string | null;
  token_secret: string | null;
};

function isoText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function cleanModel(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanVersion(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

async function expireStale(): Promise<void> {
  const sql = await getSql();
  await sql`
    update activations
    set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at <= now()
  `;
}

async function latestForDevice(deviceId: string): Promise<ActivationRow | null> {
  const sql = await getSql();
  const rows = await sql<ActivationRow>`
    select id, device_id, code, model, app_version, status,
           created_at::text as created_at, expires_at::text as expires_at,
           register_id, token_secret
    from activations
    where device_id = ${deviceId}
    order by created_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

async function readLimit(bucket: string): Promise<{ hits: number; windowStartMs: number }> {
  const sql = await getSql();
  const rows = await sql<{ hits: number; window_start: string }>`
    select hits, window_start::text as window_start
    from activation_limits
    where bucket = ${bucket}
  `;
  const row = rows[0];
  return {
    hits: Number(row?.hits ?? 0) || 0,
    windowStartMs: row ? Date.parse(isoText(row.window_start)) : 0,
  };
}

async function writeLimit(bucket: string, hits: number, windowStartMs: number): Promise<void> {
  const sql = await getSql();
  const start = new Date(windowStartMs).toISOString();
  await sql`
    insert into activation_limits (bucket, hits, window_start)
    values (${bucket}, ${hits}, ${start}::timestamptz)
    on conflict (bucket) do update set
      hits = excluded.hits,
      window_start = excluded.window_start
  `;
}

async function allowNewCode(ip: string, deviceId: string): Promise<boolean> {
  const now = Date.now();
  const ipBucket = `ip:${ip.slice(0, 80) || "unknown"}`;
  const deviceBucket = `dev:${deviceId}`;
  const [ipLimit, deviceLimit] = await Promise.all([readLimit(ipBucket), readLimit(deviceBucket)]);
  const ipNext = nextRateLimit({ ...ipLimit, now, limit: ACTIVATION_IP_LIMIT, windowMs: ACTIVATION_WINDOW_MS });
  const deviceNext = nextRateLimit({ ...deviceLimit, now, limit: ACTIVATION_DEVICE_LIMIT, windowMs: ACTIVATION_WINDOW_MS });
  if (!ipNext.allow || !deviceNext.allow) return false;
  await writeLimit(ipBucket, ipNext.hits, ipNext.windowStartMs);
  await writeLimit(deviceBucket, deviceNext.hits, deviceNext.windowStartMs);
  return true;
}

async function freshCode(): Promise<string> {
  const sql = await getSql();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateActivationCode(() => randomInt(0, ACTIVATION_ALPHABET.length) / ACTIVATION_ALPHABET.length);
    const taken = await sql<{ id: string }>`
      select id from activations
      where code = ${code} and status = 'pending' and expires_at > now()
      limit 1
    `;
    if (!taken[0]) return code;
  }
  throw new Error("לא הצלחנו להפיק קוד הפעלה.");
}

export async function requestActivation(input: {
  deviceId: string;
  model: string;
  appVersion: string;
  ip: string;
}): Promise<{ ok: true; code: string } | { ok: false; status: 400 | 429; error: string }> {
  if (!isDeviceId(input.deviceId)) return { ok: false, status: 400, error: "מזהה מכשיר לא תקין." };
  await expireStale();
  const model = cleanModel(input.model);
  const appVersion = cleanVersion(input.appVersion);
  const current = await latestForDevice(input.deviceId);
  if (current && current.status === "pending" && Date.parse(isoText(current.expires_at)) > Date.now()) {
    const sql = await getSql();
    await sql`
      update activations
      set model = ${model}, app_version = ${appVersion}
      where id = ${current.id} and status = 'pending'
    `;
    return { ok: true, code: formatActivationCode(current.code) };
  }
  if (!(await allowNewCode(input.ip || "unknown", input.deviceId))) {
    return { ok: false, status: 429, error: "יותר מדי בקשות הפעלה. נסו שוב בעוד שעה." };
  }
  const sql = await getSql();
  const code = await freshCode();
  const id = `act_${randomBytes(8).toString("hex")}`;
  const expires = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
  await sql`
    insert into activations (id, device_id, code, model, app_version, status, expires_at)
    values (${id}, ${input.deviceId}, ${code}, ${model}, ${appVersion}, 'pending', ${expires}::timestamptz)
  `;
  return { ok: true, code: formatActivationCode(code) };
}

export async function pollActivation(deviceId: string, stored: boolean): Promise<ActivationPoll | { status: "invalid" }> {
  if (!isDeviceId(deviceId)) return { status: "invalid" };
  await expireStale();
  const row = await latestForDevice(deviceId);
  if (!row) return { status: "none" };
  if (row.status === "expired") return { status: "expired" };
  if (row.status === "rejected") return { status: "rejected" };
  if (row.status === "pending") {
    if (Date.parse(isoText(row.expires_at)) <= Date.now()) return { status: "expired" };
    return { status: "pending", code: formatActivationCode(row.code) };
  }
  if (row.status !== "approved") return { status: "none" };
  const secret = typeof row.token_secret === "string" ? row.token_secret : "";
  if (stored && secret) {
    const sql = await getSql();
    await sql`update activations set token_secret = null where id = ${row.id} and device_id = ${deviceId}`;
    return { status: "approved" };
  }
  if (secret) return { status: "approved", token: secret };
  return { status: "approved" };
}

export async function listPendingActivations(): Promise<PendingActivation[]> {
  await expireStale();
  const sql = await getSql();
  const rows = await sql<{ id: string; code: string; model: string; app_version: string; created_at: string }>`
    select id, code, model, app_version, created_at::text as created_at
    from activations
    where status = 'pending' and expires_at > now()
    order by created_at asc
    limit 50
  `;
  return rows.map((row) => ({
    id: row.id,
    code: formatActivationCode(row.code),
    model: row.model ?? "",
    appVersion: row.app_version ?? "",
    requestedAt: isoText(row.created_at),
  }));
}

async function businessExists(businessId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ ok: boolean }>`
    select true as ok from pos_docs
    where user_id = ${OWNER_ID} and business_id = ${businessId} and kind = 'settings' and deleted = false
    limit 1
  `;
  return Boolean(rows[0]?.ok);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export async function approveActivation(input: {
  code: string;
  businessId: string;
  name: string;
}): Promise<{ id: string; number: number; name: string }> {
  const code = normalizeActivationCode(input.code);
  if (!code) throw new Error("הקוד לא תקין.");
  if (!input.businessId || !/^[A-Za-z0-9_-]{1,40}$/.test(input.businessId)) throw new Error("צריך לבחור עסק.");
  if (!(await businessExists(input.businessId))) throw new Error("העסק לא נמצא.");
  await expireStale();
  const sql = await getSql();
  const rows = await sql<ActivationRow>`
    select id, device_id, code, model, app_version, status,
           created_at::text as created_at, expires_at::text as expires_at,
           register_id, token_secret
    from activations
    where code = ${code} and status = 'pending' and expires_at > now()
    limit 1
  `;
  const activation = rows[0];
  if (!activation) throw new Error("אין בקשה ממתינה עם הקוד הזה.");
  const cleanName = cleanRegisterName(input.name);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const numbers = await sql<{ register_no: number }>`
      select register_no from registers where business_id = ${input.businessId}
    `;
    const registerNo = nextRegisterNo(numbers.map((row) => Number(row.register_no)));
    const registerId = `reg_${randomBytes(8).toString("hex")}`;
    const token = randomBytes(32).toString("base64url");
    const tokenId = `dev_${randomBytes(8).toString("hex")}`;
    const label = registerCaption(registerNo, cleanName);
    try {
      await sql`
        insert into registers (id, business_id, register_no, name, app_version)
        values (${registerId}, ${input.businessId}, ${registerNo}, ${cleanName}, ${activation.app_version ?? ""})
      `;
      await sql`
        insert into device_tokens (id, token_hash, label, register_id, business_id)
        values (${tokenId}, ${hashToken(token)}, ${label}, ${registerId}, ${input.businessId})
      `;
      const updated = await sql<{ id: string }>`
        update activations
        set status = 'approved',
            decided_at = now(),
            register_id = ${registerId},
            token_hash = ${hashToken(token)},
            token_secret = ${token}
        where id = ${activation.id} and device_id = ${activation.device_id} and status = 'pending'
        returning id
      `;
      if (!updated[0]) {
        await sql`delete from device_tokens where id = ${tokenId}`;
        await sql`delete from registers where id = ${registerId}`;
        throw new Error("הבקשה כבר טופלה.");
      }
      return { id: registerId, number: registerNo, name: cleanName };
    } catch (error) {
      await sql`delete from device_tokens where id = ${tokenId}`;
      await sql`delete from registers where id = ${registerId}`;
      if (error instanceof Error && error.message === "הבקשה כבר טופלה.") throw error;
      if (!isUniqueViolation(error) || attempt === 2) throw error;
    }
  }
  throw new Error("לא הצלחנו לאשר את הקופה.");
}

export async function rejectActivation(codeInput: string): Promise<void> {
  const code = normalizeActivationCode(codeInput);
  if (!code) throw new Error("הקוד לא תקין.");
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update activations
    set status = 'rejected', decided_at = now(), token_secret = null
    where code = ${code} and status = 'pending' and expires_at > now()
    returning id
  `;
  if (!rows[0]) throw new Error("אין בקשה ממתינה עם הקוד הזה.");
}
