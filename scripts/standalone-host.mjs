import { readFileSync } from "node:fs";

/** Vercel stays the default. The standalone image opts in with LIITPOS_STANDALONE=1. */
export function nitroPreset(env) {
  return env.LIITPOS_STANDALONE === "1" ? "node-server" : "vercel";
}

const WEAK = new Set([
  "password",
  "admin",
  "changeme",
  "postgres",
  "liitpos",
  "secret",
  "123456",
  "12345678",
  "root",
  "pass",
  "default",
]);

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readFileTrim(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * Fill process env from Docker secret files when they exist.
 * An already-set environment variable wins, so a caller can inject values
 * without the files. Nothing is printed.
 * @param {NodeJS.ProcessEnv} env
 */
export function loadSecretFiles(env) {
  const username = readFileTrim("/run/secrets/admin_username");
  const password = readFileTrim("/run/secrets/admin_password");
  const passwordHash = readFileTrim("/run/secrets/admin_password_hash");
  if (!trim(env.ADMIN_USERNAME) && username) env.ADMIN_USERNAME = username;
  if (!trim(env.ADMIN_PASSWORD) && password) env.ADMIN_PASSWORD = password;
  if (!trim(env.ADMIN_PASSWORD_HASH) && passwordHash) env.ADMIN_PASSWORD_HASH = passwordHash;

  if (trim(env.DATABASE_URL)) return;
  const dbUser = readFileTrim("/run/secrets/db_user");
  const dbPassword = readFileTrim("/run/secrets/db_password");
  if (!dbUser || !dbPassword) return;
  const host = trim(env.LIITPOS_DB_HOST) || "liitpos-db";
  const name = trim(env.LIITPOS_DB_NAME) || "liitpos";
  env.DATABASE_URL = `postgres://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${host}:5432/${encodeURIComponent(name)}`;
}

/**
 * Refuse to boot the standalone server with a missing or well-known credential,
 * or with a Neon URL. Does not log secret values.
 * @param {NodeJS.ProcessEnv} env
 */
export function preflight(env) {
  const errors = [];
  const username = trim(env.ADMIN_USERNAME);
  const password = trim(env.ADMIN_PASSWORD);
  const passwordHash = trim(env.ADMIN_PASSWORD_HASH);
  if (!username) errors.push("ADMIN_USERNAME is required and has no default");
  if (!password && !passwordHash) errors.push("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required");
  if (password) {
    if (password.length < 12 || WEAK.has(password.toLowerCase()) || password.toLowerCase() === username.toLowerCase()) {
      errors.push("ADMIN_PASSWORD is missing or too weak");
    }
  }
  if (passwordHash && !/^scrypt:[0-9a-f]+:[0-9a-f]{64}$/i.test(passwordHash)) {
    errors.push("ADMIN_PASSWORD_HASH must be scrypt:<salt hex>:<64 hex chars>");
  }

  const databaseUrl = trim(env.DATABASE_URL);
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required");
  } else {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      errors.push("DATABASE_URL is not a URL");
    }
    if (parsed) {
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        errors.push("DATABASE_URL must use postgres");
      }
      const host = parsed.hostname.toLowerCase();
      if (host.endsWith("neon.tech") || host.includes(".neon.")) {
        errors.push("DATABASE_URL must be the local Postgres, not Neon");
      }
      const dbPassword = decodeURIComponent(parsed.password);
      if (!dbPassword || dbPassword.length < 16 || WEAK.has(dbPassword.toLowerCase())) {
        errors.push("database password is missing or too weak");
      }
    }
  }

  const origin = trim(env.BETTER_AUTH_URL);
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" || url.username || url.password || (url.pathname && url.pathname !== "/")) {
        errors.push("BETTER_AUTH_URL must be an https origin with no path, user, or password");
      }
    } catch {
      errors.push("BETTER_AUTH_URL is not a URL");
    }
  }

  if (errors.length) {
    const error = new Error(errors.join("; "));
    error.code = "PREFLIGHT";
    throw error;
  }
}
