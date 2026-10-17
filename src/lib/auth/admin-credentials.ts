import { scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export type AdminCredentials = {
  username: string;
  password: string | null;
  passwordHash: string | null;
};

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Fail closed: no username, or neither a password nor a hash, means nobody can sign in. */
export function credentialsFromEnv(env: Record<string, string | undefined>): AdminCredentials | null {
  const username = text(env.ADMIN_USERNAME);
  const password = text(env.ADMIN_PASSWORD);
  const passwordHash = text(env.ADMIN_PASSWORD_HASH);
  if (!username || (!password && !passwordHash)) return null;
  return { username, password: password || null, passwordHash: passwordHash || null };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Equal-length compare so a shorter guess is not faster. */
export function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(sha256(left), sha256(right));
}

/**
 * ADMIN_PASSWORD_HASH format: `scrypt:<salt hex>:<32-byte key hex>`.
 * Salt is the hex text itself (not decoded), matching scryptSync(password, salt, 32).
 */
export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt" || !/^[0-9a-f]+$/i.test(parts[1]) || !/^[0-9a-f]+$/i.test(parts[2])) {
    return false;
  }
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== 32) return false;
  const actual = scryptSync(password, parts[1], 32);
  return timingSafeEqual(actual, expected);
}

export function credentialsAccept(username: string, password: string, creds: AdminCredentials | null): boolean {
  if (!creds) return false;
  const userOk = safeEqual(username.trim(), creds.username);
  const passOk = creds.password ? safeEqual(password, creds.password) : false;
  const hashOk = creds.passwordHash ? verifyPasswordHash(password, creds.passwordHash) : false;
  return userOk && (passOk || hashOk);
}

export function lockActive(lockedUntil: string | null, now: number): boolean {
  if (!lockedUntil) return false;
  const ms = Date.parse(lockedUntil);
  return Number.isFinite(ms) && ms > now;
}

export function recordFailure(failures: number, now: number): { failures: number; lockedUntil: string | null } {
  const next = failures + 1;
  if (next >= LOGIN_FAIL_LIMIT) {
    return { failures: next, lockedUntil: new Date(now + LOGIN_LOCK_MS).toISOString() };
  }
  return { failures: next, lockedUntil: null };
}
