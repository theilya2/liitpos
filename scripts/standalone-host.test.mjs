import assert from "node:assert/strict";
import test from "node:test";
import { nitroPreset, preflight } from "./standalone-host.mjs";

const strongDb = "postgres://liitpos_app:isolated-db-password-9f3a7c1e@liitpos-db:5432/liitpos";

function goodEnv(extra = {}) {
  return {
    ADMIN_USERNAME: "register-owner",
    ADMIN_PASSWORD: "isolated-admin-password",
    DATABASE_URL: strongDb,
    BETTER_AUTH_URL: "https://liitpos.185-250-36-27.sslip.io",
    ...extra,
  };
}

test("the default production build stays the Vercel preset", () => {
  assert.equal(nitroPreset({}), "vercel");
  assert.equal(nitroPreset({ LIITPOS_STANDALONE: "0" }), "vercel");
  assert.equal(nitroPreset({ LIITPOS_STANDALONE: "1" }), "node-server");
});

test("standalone startup rejects missing and well-known credentials", () => {
  assert.throws(() => preflight({}), /ADMIN_USERNAME/);
  assert.throws(() => preflight({ ADMIN_USERNAME: "register-owner" }), /ADMIN_PASSWORD/);
  assert.throws(() => preflight(goodEnv({ ADMIN_PASSWORD: "password" })), /too weak/);
  assert.throws(() => preflight(goodEnv({ ADMIN_PASSWORD: "register-owner" })), /too weak/);
  assert.throws(() => preflight(goodEnv({ DATABASE_URL: "postgres://u:isolated-db-password-9f3a7c1e@ep-test.neon.tech/db" })), /Neon/);
  assert.throws(() => preflight(goodEnv({ DATABASE_URL: "postgres://u:postgres@liitpos-db:5432/liitpos" })), /too weak/);
  assert.doesNotThrow(() => preflight(goodEnv()));
  assert.doesNotThrow(() =>
    preflight(goodEnv({ ADMIN_PASSWORD: "", ADMIN_PASSWORD_HASH: `scrypt:${"ab".repeat(8)}:${"cd".repeat(32)}` })),
  );
});
