import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  ACTIVATION_ALPHABET,
  ACTIVATION_LENGTH,
  activationMaterial,
  chooseActivationSource,
  codeFromDeviceHash,
  formatActivationCode,
  generateActivationCode,
  isDeviceId,
  nextRateLimit,
  normalizeActivationCode,
  planActivation,
  planApproval,
  planIdentity,
  type KnownRegister,
  type StoredIdentity,
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
    assert.equal(activationMaterial("android", "9774d56d682e549c"), "v1\nandroid\n9774d56d682e549c");
    assert.equal(activationMaterial("serial", "SERIAL-9"), "v1\nserial\nSERIAL-9");
    const hash = hashOf(activationMaterial("android", "9774d56d682e549c"));
    const again = codeFromDeviceHash(hash);
    assert.equal(again, codeFromDeviceHash(hash));
    assert.equal(again?.length, ACTIVATION_LENGTH);
    assert.equal(normalizeActivationCode(again ?? ""), again);
    assert.equal(formatActivationCode(again ?? "").length, 7);
    assert.equal(codeFromDeviceHash(hashOf(activationMaterial("random", "same-seed"))), codeFromDeviceHash(hashOf(activationMaterial("random", "same-seed"))));
    assert.notEqual(codeFromDeviceHash(hashOf(activationMaterial("random", "same-seed"))), codeFromDeviceHash(hashOf(activationMaterial("random", "other-seed"))));
    assert.notEqual(codeFromDeviceHash(hashOf(activationMaterial("serial", "SERIAL-9"))), again);
  });

  it("prefers a hardware serial, but does not replace a code that already registered", () => {
    assert.equal(chooseActivationSource(null, ["android", "serial"]), "serial");
    assert.equal(chooseActivationSource("android", ["serial", "android"]), "android");
    assert.equal(chooseActivationSource("serial", ["android"]), "android");
    assert.equal(chooseActivationSource(null, ["random"]), "random");
    const androidId = hashOf(activationMaterial("android", "device-a"));
    const serialId = hashOf(activationMaterial("serial", "SERIAL-9"));
    const androidCode = codeFromDeviceHash(androidId) ?? "";
    const known: StoredIdentity[] = [{ deviceId: androidId, code: androidCode, source: "android", primaryDeviceId: androidId, createdAt: 10 }];
    const linked = planIdentity({
      reported: [
        { source: "serial", deviceId: serialId },
        { source: "android", deviceId: androidId },
      ],
      known,
      codeOwners: [],
    });
    assert.equal(linked.action, "use");
    if (linked.action === "use") {
      assert.equal(linked.code, androidCode);
      assert.equal(linked.source, "android");
      assert.equal(linked.deviceId, androidId);
      assert.deepEqual(linked.link, [{ source: "serial", deviceId: serialId }]);
    }
    const fresh = planIdentity({
      reported: [
        { source: "android", deviceId: androidId },
        { source: "serial", deviceId: serialId },
      ],
      known: [],
      codeOwners: [],
    });
    assert.equal(fresh.action, "create");
    if (fresh.action === "create") {
      assert.equal(fresh.source, "serial");
      assert.equal(fresh.deviceId, serialId);
      assert.equal(fresh.link.length, 2);
    }
  });

  it("rejects the same code from a different device hash", () => {
    const owner = hashOf(activationMaterial("android", "device-a"));
    const other = hashOf(activationMaterial("serial", "other-device"));
    const code = codeFromDeviceHash(other) ?? "";
    const collision = planIdentity({
      reported: [{ source: "serial", deviceId: other }],
      known: [],
      codeOwners: [{ code, deviceId: owner }],
    });
    assert.equal(collision.action, "collision");
    const same = planIdentity({
      reported: [{ source: "android", deviceId: owner }],
      known: [{ deviceId: owner, code: codeFromDeviceHash(owner) ?? "", source: "android", primaryDeviceId: owner, createdAt: 1 }],
      codeOwners: [],
    });
    assert.equal(same.action, "use");
  });

  it("asks the admin to approve a reinstall and keeps the register number", () => {
    const hash = hashOf(activationMaterial("android", "device-a"));
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

  it("refreshes a live request for the same device", () => {
    const owner = hashOf(activationMaterial("android", "device-a"));
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
