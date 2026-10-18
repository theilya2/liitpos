import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/auth/admin.server";
import { getSql } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth/owner";
import {
  ACTIVATION_DEVICE_LIMIT,
  ACTIVATION_IP_LIMIT,
  ACTIVATION_TTL_MS,
  ACTIVATION_WINDOW_MS,
  codeFromDeviceHash,
  formatActivationCode,
  isDeviceHash,
  nextRateLimit,
  normalizeActivationCode,
  planActivation,
  planApproval,
  type KnownRegister,
} from "@/lib/pos/activation";
import { cleanRegisterName, nextRegisterNo, registerCaption } from "@/lib/pos/register";

export type PendingReinstall = {
  registerId: string;
  number: number;
  name: string;
  businessId: string;
  revoked: boolean;
};

export type PendingActivation = {
  id: string;
  code: string;
  model: string;
  appVersion: string;
  requestedAt: string;
  reinstall: PendingReinstall | null;
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

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "t" || value === "true";
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

async function claimDevice(deviceId: string, code: string): Promise<"ok" | "collision"> {
  const sql = await getSql();
  try {
    await sql`
      insert into activation_devices (device_id, code)
      values (${deviceId}, ${code})
      on conflict (device_id) do nothing
    `;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    console.error("[activation] duplicate code from a different device", { code, deviceId });
    return "collision";
  }
  const rows = await sql<{ device_id: string }>`
    select device_id from activation_devices where code = ${code} limit 1
  `;
  const owner = rows[0]?.device_id ?? "";
  if (owner && owner !== deviceId) {
    console.error("[activation] duplicate code from a different device", { code, deviceId, owner });
    return "collision";
  }
  return "ok";
}

async function registerForDevice(deviceId: string): Promise<KnownRegister | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    register_no: number;
    name: string;
    business_id: string;
    revoked: boolean;
  }>`
    select r.id, r.register_no, r.name, r.business_id, (r.revoked_at is not null) as revoked
    from activations a
    join registers r on r.id = a.register_id
    where a.device_id = ${deviceId} and a.status = 'approved' and a.register_id is not null
    order by a.created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const number = Number(row.register_no);
  if (!Number.isInteger(number) || number < 1) return null;
  return {
    id: row.id,
    number,
    name: row.name ?? "",
    businessId: row.business_id,
    revoked: asBool(row.revoked),
  };
}

export async function requestActivation(input: {
  deviceId: string;
  model: string;
  appVersion: string;
  ip: string;
}): Promise<{ ok: true; code: string } | { ok: false; status: 400 | 409 | 429; error: string }> {
  const deviceId = input.deviceId.trim().toLowerCase();
  const code = codeFromDeviceHash(deviceId);
  if (!isDeviceHash(deviceId) || !code) return { ok: false, status: 400, error: "מזהה מכשיר לא תקין." };
  await expireStale();
  if ((await claimDevice(deviceId, code)) === "collision") {
    return { ok: false, status: 409, error: "הקוד הזה כבר שייך לקופה אחרת." };
  }
  const model = cleanModel(input.model);
  const appVersion = cleanVersion(input.appVersion);
  const current = await latestForDevice(deviceId);
  const livePending = Boolean(current && current.status === "pending" && Date.parse(isoText(current.expires_at)) > Date.now());
  const register = await registerForDevice(deviceId);
  const plan = planActivation({
    deviceId,
    codeOwnerDeviceId: deviceId,
    livePending,
    register,
  });
  if (plan.action === "refresh" && current) {
    const sql = await getSql();
    await sql`
      update activations
      set model = ${model}, app_version = ${appVersion}, code = ${code}, register_id = ${register?.id ?? current.register_id}
      where id = ${current.id} and status = 'pending'
    `;
    return { ok: true, code: formatActivationCode(code) };
  }
  if (!(await allowNewCode(input.ip || "unknown", deviceId))) {
    return { ok: false, status: 429, error: "יותר מדי בקשות הפעלה. נסו שוב בעוד שעה." };
  }
  const sql = await getSql();
  const id = `act_${randomBytes(8).toString("hex")}`;
  const expires = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
  await sql`
    insert into activations (id, device_id, code, model, app_version, status, expires_at, register_id)
    values (${id}, ${deviceId}, ${code}, ${model}, ${appVersion}, 'pending', ${expires}::timestamptz, ${register?.id ?? null})
  `;
  return { ok: true, code: formatActivationCode(code) };
}

export async function pollActivation(deviceIdInput: string, stored: boolean): Promise<ActivationPoll | { status: "invalid" }> {
  const deviceId = deviceIdInput.trim().toLowerCase();
  if (!isDeviceHash(deviceId)) return { status: "invalid" };
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
  const rows = await sql<{
    id: string;
    code: string;
    model: string;
    app_version: string;
    created_at: string;
    register_id: string | null;
    register_no: number | null;
    register_name: string | null;
    business_id: string | null;
    revoked: boolean | null;
  }>`
    select a.id, a.code, a.model, a.app_version, a.created_at::text as created_at,
           r.id as register_id, r.register_no, r.name as register_name, r.business_id,
           (r.revoked_at is not null) as revoked
    from activations a
    left join registers r on r.id = a.register_id
    where a.status = 'pending' and a.expires_at > now()
    order by a.created_at asc
    limit 50
  `;
  return rows.map((row) => {
    const number = Number(row.register_no);
    const reinstall = row.register_id && row.business_id && Number.isInteger(number) && number > 0
      ? {
          registerId: row.register_id,
          number,
          name: row.register_name ?? "",
          businessId: row.business_id,
          revoked: asBool(row.revoked),
        }
      : null;
    return {
      id: row.id,
      code: formatActivationCode(row.code),
      model: row.model ?? "",
      appVersion: row.app_version ?? "",
      requestedAt: isoText(row.created_at),
      reinstall,
    };
  });
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

async function loadRegister(id: string): Promise<KnownRegister | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; register_no: number; name: string; business_id: string; revoked: boolean }>`
    select id, register_no, name, business_id, (revoked_at is not null) as revoked
    from registers
    where id = ${id}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const number = Number(row.register_no);
  if (!Number.isInteger(number) || number < 1) return null;
  return { id: row.id, number, name: row.name ?? "", businessId: row.business_id, revoked: asBool(row.revoked) };
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
  const existing = activation.register_id ? await loadRegister(activation.register_id) : null;
  const approval = planApproval({ businessId: input.businessId, register: existing });
  if (approval.mode === "wrong-business") throw new Error("הקופה הזו כבר משויכת לעסק. האישור חוזר לאותו מספר קופה.");
  if (approval.mode === "reuse") {
    const token = randomBytes(32).toString("base64url");
    const tokenId = `dev_${randomBytes(8).toString("hex")}`;
    const name = cleanName || approval.register.name;
    const label = registerCaption(approval.register.number, name);
    await sql`
      insert into device_tokens (id, token_hash, label, register_id, business_id)
      values (${tokenId}, ${hashToken(token)}, ${label}, ${approval.register.id}, ${approval.register.businessId})
    `;
    const updated = await sql<{ id: string }>`
      update activations
      set status = 'approved',
          decided_at = now(),
          register_id = ${approval.register.id},
          token_hash = ${hashToken(token)},
          token_secret = ${token}
      where id = ${activation.id} and device_id = ${activation.device_id} and status = 'pending'
      returning id
    `;
    if (!updated[0]) {
      await sql`delete from device_tokens where id = ${tokenId}`;
      throw new Error("הבקשה כבר טופלה.");
    }
    await sql`
      update device_tokens
      set revoked_at = now()
      where register_id = ${approval.register.id} and id <> ${tokenId} and revoked_at is null
    `;
    await sql`
      update registers
      set revoked_at = null, name = ${name}, app_version = ${activation.app_version ?? ""}
      where id = ${approval.register.id}
    `;
    return { id: approval.register.id, number: approval.register.number, name };
  }
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
