import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVATION_ALPHABET,
  ACTIVATION_LENGTH,
  formatActivationCode,
  generateActivationCode,
  isDeviceId,
  nextRateLimit,
  normalizeActivationCode,
} from "./activation.ts";

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
