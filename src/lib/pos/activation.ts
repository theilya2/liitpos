/** No 0/O or 1/I, so a code read aloud from the register is unambiguous. */
export const ACTIVATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ACTIVATION_LENGTH = 6;
/** Pending rows leave the admin list after this. The code itself does not change. */
export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_WINDOW_MS = 60 * 60 * 1000;
export const ACTIVATION_IP_LIMIT = 60;
export const ACTIVATION_DEVICE_LIMIT = 8;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const DEVICE_HASH = /^[a-f0-9]{64}$/;

export function isDeviceId(value: string): boolean {
  return DEVICE_ID.test(value);
}

/** SHA-256 hex of the native or web material. This is the activation identity. */
export function isDeviceHash(value: string): boolean {
  return DEVICE_HASH.test(value.trim().toLowerCase());
}

function cleanMaterialPart(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

/** serial survives factory reset on a device-owner kiosk; android id survives reinstall; random is the last resort. */
export const ACTIVATION_SOURCES = ["serial", "android", "random"] as const;
export type ActivationSource = (typeof ACTIVATION_SOURCES)[number];

export function isActivationSource(value: string): value is ActivationSource {
  return (ACTIVATION_SOURCES as readonly string[]).includes(value);
}

export function activationSourceLabel(source: ActivationSource): string {
  if (source === "serial") return "מספר סידורי";
  if (source === "android") return "מזהה אנדרואיד";
  return "מזהה שמור";
}

/** Bytes hashed into one source. Each source is hashed alone so a new source cannot change an existing code. */
export function activationMaterial(source: ActivationSource, value: string): string {
  return `v1\n${source}\n${cleanMaterialPart(value)}`;
}

export type ReportedIdentity = { source: ActivationSource; deviceId: string };

export type StoredIdentity = {
  deviceId: string;
  code: string;
  source: ActivationSource;
  primaryDeviceId: string;
  createdAt: number;
};

/** Keep the source that already registered. Otherwise prefer serial, then ANDROID_ID, then a stored random id. */
export function chooseActivationSource(stored: ActivationSource | null, available: ActivationSource[]): ActivationSource | null {
  if (stored && available.includes(stored)) return stored;
  for (const source of ACTIVATION_SOURCES) {
    if (available.includes(source)) return source;
  }
  return null;
}

export type IdentityPlan =
  | { action: "invalid" }
  | { action: "collision"; code: string; deviceId: string }
  | { action: "use"; code: string; source: ActivationSource; deviceId: string; link: ReportedIdentity[]; conflict: boolean }
  | { action: "create"; code: string; source: ActivationSource; deviceId: string; link: ReportedIdentity[] };

function dedupeReported(reported: ReportedIdentity[]): ReportedIdentity[] {
  const seen = new Set<string>();
  const clean: ReportedIdentity[] = [];
  for (const item of reported) {
    const deviceId = item.deviceId.trim().toLowerCase();
    if (!isActivationSource(item.source) || !DEVICE_HASH.test(deviceId) || seen.has(deviceId)) continue;
    seen.add(deviceId);
    clean.push({ source: item.source, deviceId });
  }
  return clean;
}

/**
 * The first source that registered owns the code.
 * Later ids from the same device are linked to that code instead of replacing it.
 */
export function planIdentity(input: {
  reported: ReportedIdentity[];
  known: StoredIdentity[];
  codeOwners: { code: string; deviceId: string }[];
}): IdentityPlan {
  const reported = dedupeReported(input.reported);
  if (!reported.length) return { action: "invalid" };
  const known = input.known.filter((row) => isDeviceHash(row.deviceId) && isDeviceHash(row.primaryDeviceId) && Boolean(normalizeActivationCode(row.code)));
  if (known.length) {
    const primaries = known.filter((row) => row.deviceId === row.primaryDeviceId);
    const canonical = [...(primaries.length ? primaries : known)].sort((left, right) => left.createdAt - right.createdAt || left.deviceId.localeCompare(right.deviceId))[0];
    if (!canonical) return { action: "invalid" };
    const codes = new Set(known.map((row) => row.code));
    const link = reported.filter((item) => !known.some((row) => row.deviceId === item.deviceId));
    return {
      action: "use",
      code: canonical.code,
      source: canonical.source,
      deviceId: canonical.primaryDeviceId,
      link,
      conflict: codes.size > 1 || new Set(known.map((row) => row.primaryDeviceId)).size > 1,
    };
  }
  const source = chooseActivationSource(null, reported.map((item) => item.source));
  const chosen = reported.find((item) => item.source === source);
  const code = chosen ? codeFromDeviceHash(chosen.deviceId) : null;
  if (!chosen || !source || !code) return { action: "invalid" };
  const foreign = input.codeOwners.some((row) => row.code === code && !reported.some((item) => item.deviceId === row.deviceId));
  if (foreign) return { action: "collision", code, deviceId: chosen.deviceId };
  return { action: "create", code, source, deviceId: chosen.deviceId, link: reported };
}

/** First 6 letters of the device hash, using the unambiguous alphabet. */
export function codeFromDeviceHash(hashHex: string): string | null {
  const hex = hashHex.trim().toLowerCase();
  if (!DEVICE_HASH.test(hex)) return null;
  let code = "";
  for (let index = 0; index < ACTIVATION_LENGTH; index += 1) {
    const byte = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    code += ACTIVATION_ALPHABET[byte & 31] ?? "A";
  }
  return code;
}

export type KnownRegister = {
  id: string;
  number: number;
  name: string;
  businessId: string;
  revoked: boolean;
};

export function planActivation(input: {
  deviceId: string;
  codeOwnerDeviceId: string | null;
  livePending: boolean;
  register: KnownRegister | null;
}): { action: "collision" } | { action: "refresh" } | { action: "open"; register: KnownRegister | null } {
  if (input.codeOwnerDeviceId && input.codeOwnerDeviceId !== input.deviceId) return { action: "collision" };
  if (input.livePending) return { action: "refresh" };
  return { action: "open", register: input.register };
}

export function planApproval(input: {
  businessId: string;
  register: KnownRegister | null;
}): { mode: "create" } | { mode: "reuse"; register: KnownRegister } | { mode: "wrong-business" } {
  if (!input.register) return { mode: "create" };
  if (input.register.businessId !== input.businessId) return { mode: "wrong-business" };
  return { mode: "reuse", register: input.register };
}

export function normalizeActivationCode(value: string): string | null {
  const raw = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (raw.length !== ACTIVATION_LENGTH) return null;
  for (const char of raw) {
    if (!ACTIVATION_ALPHABET.includes(char)) return null;
  }
  return raw;
}

export function formatActivationCode(code: string): string {
  const raw = normalizeActivationCode(code) ?? code.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (raw.length !== ACTIVATION_LENGTH) return raw;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

export function generateActivationCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < ACTIVATION_LENGTH; index += 1) {
    const pick = Math.floor(random() * ACTIVATION_ALPHABET.length);
    code += ACTIVATION_ALPHABET[Math.min(ACTIVATION_ALPHABET.length - 1, Math.max(0, pick))] ?? "A";
  }
  return code;
}

export function nextRateLimit(input: {
  hits: number;
  windowStartMs: number;
  now: number;
  limit: number;
  windowMs: number;
}): { allow: boolean; hits: number; windowStartMs: number } {
  if (!Number.isFinite(input.windowStartMs) || input.now - input.windowStartMs >= input.windowMs) {
    return { allow: true, hits: 1, windowStartMs: input.now };
  }
  if (input.hits >= input.limit) return { allow: false, hits: input.hits, windowStartMs: input.windowStartMs };
  return { allow: true, hits: input.hits + 1, windowStartMs: input.windowStartMs };
}
