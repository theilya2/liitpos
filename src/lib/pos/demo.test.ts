import assert from "node:assert/strict";
import test from "node:test";
import { canUseBusiness, isDemoBusiness, isDemoMode } from "@/lib/pos/demo.ts";

test("demo businesses stay closed unless demo mode is on", () => {
  assert.equal(isDemoMode(), false);
  assert.equal(isDemoBusiness("store-main", "100001"), true);
  assert.equal(isDemoBusiness("store-kiosk", "200002"), true);
  assert.equal(isDemoBusiness("store-real", "100001"), true);
  assert.equal(isDemoBusiness("store-real", "482913"), false);
  assert.equal(canUseBusiness("store-main"), false);
  assert.equal(canUseBusiness("store-kiosk", "200002"), false);
  assert.equal(canUseBusiness("store-real", "482913"), true);
});
