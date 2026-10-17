import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LOGIN_FAIL_LIMIT,
  credentialsAccept,
  credentialsFromEnv,
  recordFailure,
  verifyPasswordHash,
} from "./admin-credentials.ts";
import { OWNER_ID } from "./owner.ts";
import { cleanDeviceLabel, pairingLink } from "./pairing.ts";

describe("admin credentials", () => {
  it("fails closed when the username or secret is missing", () => {
    assert.equal(credentialsFromEnv({}), null);
    assert.equal(credentialsFromEnv({ ADMIN_USERNAME: "ilya" }), null);
    assert.equal(credentialsFromEnv({ ADMIN_PASSWORD: "secret" }), null);
    assert.equal(credentialsFromEnv({ ADMIN_USERNAME: "  ", ADMIN_PASSWORD: "secret" }), null);
  });

  it("accepts the plain password or the scrypt hash, and nothing else", () => {
    const salt = "abc123";
    const hash = `scrypt:${salt}:${scryptSync("secret-pass", salt, 32).toString("hex")}`;
    const creds = credentialsFromEnv({
      ADMIN_USERNAME: "ilya",
      ADMIN_PASSWORD: "plain-secret",
      ADMIN_PASSWORD_HASH: hash,
    });
    assert.equal(credentialsAccept("ilya", "plain-secret", creds), true);
    assert.equal(credentialsAccept("ilya", "secret-pass", creds), true);
    assert.equal(credentialsAccept("ilya", "nope", creds), false);
    assert.equal(credentialsAccept("other", "plain-secret", creds), false);
    assert.equal(verifyPasswordHash("secret-pass", "not-a-hash"), false);
    assert.equal(credentialsAccept("ilya", "plain-secret", null), false);
  });

  it("locks after the failure limit", () => {
    const now = Date.parse("2026-10-17T12:00:00.000Z");
    const before = recordFailure(LOGIN_FAIL_LIMIT - 2, now);
    assert.equal(before.lockedUntil, null);
    const locked = recordFailure(LOGIN_FAIL_LIMIT - 1, now);
    assert.ok(locked.lockedUntil);
    assert.ok(Date.parse(locked.lockedUntil) - now >= 15 * 60 * 1000);
  });
});

describe("device pairing", () => {
  it("builds the deep link the phone already handles", () => {
    const link = pairingLink("tok/en", "https://liitpos.vercel.app/");
    assert.equal(link, "liitpos://link?token=tok%2Fen&cloud=https%3A%2F%2Fliitpos.vercel.app");
    assert.equal(cleanDeviceLabel("  קופה  "), "קופה");
    assert.equal(cleanDeviceLabel(""), null);
    assert.equal(cleanDeviceLabel("x".repeat(41)), null);
  });

  it("moves every existing cloud row onto the single owner and stores only token hashes", () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../migrations/0003_admin_devices.sql"), "utf8");
    assert.match(sql, new RegExp(`user_id = '${OWNER_ID}'`));
    assert.match(sql, /token_hash text not null unique/);
    assert.match(sql, /create table if not exists device_tokens/);
    assert.match(sql, /create table if not exists login_attempts/);
    assert.match(sql, /create table if not exists admin_sessions/);
    assert.doesNotMatch(sql, /password/);
  });
});
