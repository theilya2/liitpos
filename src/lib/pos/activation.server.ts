import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/auth/admin.server";
import { getSql } from "@/lib/db";
import { OWNER_ID } from "@/lib/auth/owner";
import {
  ACTIVATION_DEVICE_LIMIT,
  ACTIVATION_IP_LIMIT,
  ACTIVATION_TTL_MS,
  ACTIVATION_WINDOW_MS,
  formatActivationCode,
  isActivationSource,
  isDeviceHash,
  nextRateLimit,
  normalizeActivationCode,
  planActivation,
  planApproval,
  planIdentity,
  type ActivationSource,
  type KnownRegister,
  type ReportedIdentity,
  type StoredIdentity,
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
  source: ActivationSource | null;
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

function reportedIdentities(deviceId: string, sources: { source?: string; deviceId?: string }[]): ReportedIdentity[] {
  const raw = sources.length
    ? sources
    : isDeviceHash(deviceId)
      ? [{ source: "android", deviceId }]
      : [];
  const clean: ReportedIdentity[] = [];
  for (const item of raw.slice(0, 3)) {
    const source = typeof item.source === "string" ? item.source : "";
    const id = typeof item.deviceId === "string" ? item.deviceId.trim().toLowerCase() : "";
    if (!isActivationSource(source) || !isDeviceHash(id)) continue;
    clean.push({ source, deviceId: id });
  }
  return clean;
}

async function readIdentity(deviceId: string): Promise<StoredIdentity | null> {
  const sql = await getSql();
  const rows = await sql<{
    device_id: string;
    code: string;
    source: string;
    primary_device_id: string | null;
    created_at: string;
  }>`
    select device_id, code, source, primary_device_id, created_at::text as created_at
    from activation_devices
    where device_id = ${deviceId}
    limit 1
  `;
  const row = rows[0];
  const code = row ? normalizeActivationCode(row.code) : null;
  if (!row || !code || !isDeviceHash(row.device_id)) return null;
  const source = isActivationSource(row.source) ? row.source : "android";
  const primary = row.primary_device_id && isDeviceHash(row.primary_device_id) ? row.primary_device_id : row.device_id;
  return { deviceId: row.device_id, code, source, primaryDeviceId: primary, createdAt: Date.parse(isoText(row.created_at)) || 0 };
}

async function loadKnown(reported: ReportedIdentity[]): Promise<StoredIdentity[]> {
  const found = new Map<string, StoredIdentity>();
  for (const item of reported) {
    const row = await readIdentity(item.deviceId);
    if (row) found.set(row.deviceId, row);
  }
  for (const row of [...found.values()]) {
    if (found.has(row.primaryDeviceId)) continue;
    const primary = await readIdentity(row.primaryDeviceId);
    if (primary) found.set(primary.deviceId, primary);
  }
  return [...found.values()];
}

async function codeOwners(code: string): Promise<{ code: string; deviceId: string }[]> {
  const sql = await getSql();
  const rows = await sql<{ device_id: string; code: string }>`
    select device_id, code from activation_devices where code = ${code}
  `;
  return rows.map((row) => ({ code: row.code, deviceId: row.device_id }));
}

async function linkIdentities(code: string, primaryDeviceId: string, rows: ReportedIdentity[]): Promise<void> {
  const sql = await getSql();
  for (const row of rows) {
    await sql`
      insert into activation_devices (device_id, code, source, primary_device_id)
      values (${row.deviceId}, ${code}, ${row.source}, ${primaryDeviceId})
      on conflict (device_id) do nothing
    `;
  }
}

async function primaryDeviceId(deviceId: string): Promise<string> {
  const row = await readIdentity(deviceId);
  return row?.primaryDeviceId || deviceId;
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
  sources?: { source?: string; deviceId?: string }[];
  model: string;
  appVersion: string;
  ip: string;
}): Promise<{ ok: true; code: string; source: ActivationSource; deviceId: string } | { ok: false; status: 400 | 409 | 429; error: string }> {
  const reported = reportedIdentities(input.deviceId, input.sources ?? []);
  if (!reported.length) return { ok: false, status: 400, error: "מזהה מכשיר לא תקין." };
  await expireStale();
  const known = await loadKnown(reported);
  const draft = planIdentity({ reported, known, codeOwners: [] });
  const owners = draft.action === "create" ? await codeOwners(draft.code) : [];
  const identity = planIdentity({ reported, known, codeOwners: owners });
  if (identity.action === "invalid") return { ok: false, status: 400, error: "מזהה מכשיר לא תקין." };
  if (identity.action === "collision") {
    console.error("[activation] duplicate code from a different device", { code: identity.code, deviceId: identity.deviceId });
    return { ok: false, status: 409, error: "הקוד הזה כבר שייך לקופה אחרת." };
  }
  if (identity.action === "use" && identity.conflict) {
    console.error("[activation] reported ids already belong to different codes", { code: identity.code, deviceId: identity.deviceId });
  }
  await linkIdentities(identity.code, identity.deviceId, identity.link);
  if (identity.action === "create") {
    const existing = await codeOwners(identity.code);
    const foreign = existing.filter((row) => row.deviceId !== identity.deviceId && !reported.some((item) => item.deviceId === row.deviceId));
    if (foreign.length) {
      const sql = await getSql();
      for (const item of reported) {
        await sql`delete from activation_devices where device_id = ${item.deviceId} and primary_device_id = ${identity.deviceId}`;
      }
      console.error("[activation] duplicate code from a different device", { code: identity.code, deviceId: identity.deviceId, owner: foreign[0]?.deviceId });
      return { ok: false, status: 409, error: "הקוד הזה כבר שייך לקופה אחרת." };
    }
  }
  const deviceId = identity.deviceId;
  const code = identity.code;
  const model = cleanModel(input.model);
  const appVersion = cleanVersion(input.appVersion);
  const current = await latestForDevice(deviceId);
  const livePending = Boolean(current && current.status === "pending" && Date.parse(isoText(current.expires_at)) > Date.now());
  const register = await registerForDevice(deviceId);
  const plan = planActivation({ deviceId, codeOwnerDeviceId: deviceId, livePending, register });
  const response = { ok: true as const, code: formatActivationCode(code), source: identity.source, deviceId };
  if (plan.action === "refresh" && current) {
    const sql = await getSql();
    await sql`
      update activations
      set model = ${model}, app_version = ${appVersion}, code = ${code}, register_id = ${register?.id ?? current.register_id}
      where id = ${current.id} and status = 'pending'
    `;
    return response;
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
  return response;
}

export async function pollActivation(deviceIdInput: string, stored: boolean): Promise<ActivationPoll | { status: "invalid" }> {
  const presented = deviceIdInput.trim().toLowerCase();
  if (!isDeviceHash(presented)) return { status: "invalid" };
  const deviceId = await primaryDeviceId(presented);
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
    source: string | null;
  }>`
    select a.id, a.code, a.model, a.app_version, a.created_at::text as created_at,
           r.id as register_id, r.register_no, r.name as register_name, r.business_id,
           (r.revoked_at is not null) as revoked, d.source
    from activations a
    left join registers r on r.id = a.register_id
    left join activation_devices d on d.device_id = a.device_id
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
      source: row.source && isActivationSource(row.source) ? row.source : null,
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
