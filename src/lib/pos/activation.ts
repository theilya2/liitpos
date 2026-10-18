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

/**
 * Bytes that are hashed into the permanent code.
 * Android mixes in a real serial when the platform returns one.
 * The build fingerprint is left out: it changes on a system update and is not unique per device.
 */
export function activationMaterial(source: "android" | "web", primary: string, serial = ""): string {
  const id = cleanMaterialPart(primary);
  if (source === "web") return `v1\nweb\n${id}`;
  return `v1\n${id}\n${cleanMaterialPart(serial)}`;
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
