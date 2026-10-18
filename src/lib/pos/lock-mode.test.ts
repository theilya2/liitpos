import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MISSING_BUSINESS_DETAIL, lockView } from "./lock-mode.ts";

const base = {
  demo: false,
  paired: false,
  businessReady: false,
  staffCount: 0,
  phase: "checking" as const,
  detail: "",
  attempt: 0,
};

describe("lock screen mode", () => {
  it("keeps the business-code keypad in demo mode", () => {
    assert.equal(lockView({ ...base, demo: true }).kind, "code");
    assert.equal(lockView({ ...base, demo: true, paired: true, businessReady: true, staffCount: 2 }).kind, "code");
  });

  it("hides the keypad when the device has no token", () => {
    assert.deepEqual(lockView(base), { kind: "unpaired" });
  });

  it("waits for the first sync before showing a failure", () => {
    assert.equal(lockView({ ...base, paired: true, phase: "local", detail: "המכשיר לא משויך" }).kind, "loading");
    assert.equal(lockView({ ...base, paired: true, phase: "syncing", attempt: 1 }).kind, "loading");
  });

  it("shows the sync failure once an attempt has finished", () => {
    const view = lockView({ ...base, paired: true, phase: "error", detail: "השרת החזיר שגיאה 503.", attempt: 1 });
    assert.deepEqual(view, { kind: "failed", detail: "השרת החזיר שגיאה 503." });
  });

  it("says the business never arrived when sync succeeded without it", () => {
    const view = lockView({ ...base, paired: true, phase: "synced", detail: "הכל בענן", attempt: 1 });
    assert.deepEqual(view, { kind: "failed", detail: MISSING_BUSINESS_DETAIL });
  });

  it("opens the staff pad, or asks for a worker when the business has none", () => {
    assert.deepEqual(lockView({ ...base, paired: true, businessReady: true, staffCount: 1, phase: "synced", attempt: 1 }), {
      kind: "pin",
      emptyStaff: false,
    });
    assert.deepEqual(lockView({ ...base, paired: true, businessReady: true, staffCount: 0, phase: "synced", attempt: 1 }), {
      kind: "pin",
      emptyStaff: true,
    });
  });
});
