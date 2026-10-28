import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readUpdateEvent } from "./update-event.ts";

describe("readUpdateEvent", () => {
  it("keeps a download percent inside 0 to 100", () => {
    assert.deepEqual(readUpdateEvent({ phase: "progress", percent: 40.2, message: "מורידים 40%" }), {
      phase: "progress",
      percent: 40,
      message: "מורידים 40%",
    });
    assert.equal(readUpdateEvent({ phase: "progress", percent: 140, message: "מורידים" })?.percent, 100);
    assert.equal(readUpdateEvent({ phase: "progress", percent: -1, message: "מורידים…" })?.percent, null);
  });

  it("shows a Hebrew fallback when an error arrives without text", () => {
    const notice = readUpdateEvent({ phase: "error" });
    assert.equal(notice?.phase, "error");
    assert.match(notice?.message ?? "", /עדכון/);
  });

  it("ignores a notice that is not part of the update flow", () => {
    assert.equal(readUpdateEvent(null), null);
    assert.equal(readUpdateEvent({ phase: "surprise", message: "nope" }), null);
    assert.equal(readUpdateEvent("מורידים"), null);
  });
});
