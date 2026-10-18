import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  ACTIVATION_ALPHABET,
  ACTIVATION_LENGTH,
  activationMaterial,
  codeFromDeviceHash,
  formatActivationCode,
  generateActivationCode,
  isDeviceId,
  nextRateLimit,
  normalizeActivationCode,
  planActivation,
  planApproval,
  type KnownRegister,
} from "./activation.ts";

const desk: KnownRegister = { id: "reg_aabbccddeeff0011", number: 3, name: "דלפק", businessId: "store-bakery", revoked: false };

function hashOf(material: string): string {
  return createHash("sha256").update(material).digest("hex");
}

describe("activation codes", () => {
  it("keeps a spoken code unambiguous", () => {
    assert.equal(ACTIVATION_ALPHABET.includes("0"), false);
    assert.equal(ACTIVATION_ALPHABET.includes("O"), false);
    assert.equal(ACTIVATION_ALPHABET.includes("1"), false);
    assert.equal(ACTIVATION_ALPHABET.includes("I"), false);
    assert.equal(normalizeActivationCode("4k7-29p"), "4K729P");
    assert.equal(formatActivationCode("4k729p"), "4K7-29P");
    assert.equal(normalizeActivationCode("0O1IAB"), null);
    assert.equal(normalizeActivationCode("4K7"), null);
  });

  it("draws only from the alphabet", () => {
    const code = generateActivationCode(() => 0.999);
    assert.equal(code.length, ACTIVATION_LENGTH);
    assert.equal(normalizeActivationCode(code), code);
    assert.equal(formatActivationCode(code).includes("-"), true);
  });

  it("accepts a stable device id and rejects a short one", () => {
    assert.equal(isDeviceId("6f1c2a90-1b2c-4d5e-8f01-23456789abcd"), true);
    assert.equal(isDeviceId("short"), false);
    assert.equal(isDeviceId("has space!"), false);
  });

  it("keeps one code for a device, including after a reinstall", () => {
    const material = activationMaterial("android", "9774d56d682e549c", "SERIAL-9");
    assert.equal(material, "v1\n9774d56d682e549c\nSERIAL-9");
    const hash = hashOf(material);
    const again = codeFromDeviceHash(hash);
    assert.equal(again, codeFromDeviceHash(hash));
    assert.equal(again?.length, ACTIVATION_LENGTH);
    assert.equal(normalizeActivationCode(again ?? ""), again);
    assert.equal(formatActivationCode(again ?? "").length, 7);
    assert.equal(codeFromDeviceHash(hashOf(activationMaterial("web", "same-seed"))), codeFromDeviceHash(hashOf(activationMaterial("web", "same-seed"))));
    assert.notEqual(codeFromDeviceHash(hashOf(activationMaterial("web", "same-seed"))), codeFromDeviceHash(hashOf(activationMaterial("web", "other-seed"))));
  });

  it("asks the admin to approve a reinstall and keeps the register number", () => {
    const hash = hashOf(activationMaterial("android", "device-a", ""));
    const open = planActivation({ deviceId: hash, codeOwnerDeviceId: hash, livePending: false, register: desk });
    assert.deepEqual(open, { action: "open", register: desk });
    const approval = planApproval({ businessId: desk.businessId, register: desk });
    assert.deepEqual(approval, { mode: "reuse", register: desk });
    if (approval.mode === "reuse") assert.equal(approval.register.number, 3);
    const revoked = planApproval({ businessId: desk.businessId, register: { ...desk, revoked: true } });
    assert.equal(revoked.mode, "reuse");
    if (revoked.mode === "reuse") assert.equal(revoked.register.number, 3);
    assert.equal(planApproval({ businessId: "store-other", register: desk }).mode, "wrong-business");
    assert.equal(planApproval({ businessId: desk.businessId, register: null }).mode, "create");
  });

  it("rejects the same code from a different device hash", () => {
    const owner = hashOf(activationMaterial("android", "device-a", ""));
    const other = hashOf(activationMaterial("android", "device-b", ""));
    assert.equal(planActivation({ deviceId: other, codeOwnerDeviceId: owner, livePending: false, register: null }).action, "collision");
    assert.equal(planActivation({ deviceId: owner, codeOwnerDeviceId: owner, livePending: true, register: desk }).action, "refresh");
  });

  it("resets the window, then stops at the limit", () => {
    const opened = nextRateLimit({ hits: 9, windowStartMs: 0, now: 10_000, limit: 2, windowMs: 1000 });
    assert.deepEqual(opened, { allow: true, hits: 1, windowStartMs: 10_000 });
    const next = nextRateLimit({ hits: 1, windowStartMs: 10_000, now: 10_100, limit: 2, windowMs: 1000 });
    assert.equal(next.allow, true);
    assert.equal(next.hits, 2);
    const denied = nextRateLimit({ hits: 2, windowStartMs: 10_000, now: 10_200, limit: 2, windowMs: 1000 });
    assert.deepEqual(denied, { allow: false, hits: 2, windowStartMs: 10_000 });
  });
});
