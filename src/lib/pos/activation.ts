/** No 0/O or 1/I, so a code read aloud from the register is unambiguous. */
export const ACTIVATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ACTIVATION_LENGTH = 6;
export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVATION_WINDOW_MS = 60 * 60 * 1000;
export const ACTIVATION_IP_LIMIT = 60;
export const ACTIVATION_DEVICE_LIMIT = 8;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function isDeviceId(value: string): boolean {
  return DEVICE_ID.test(value);
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
