import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serverErrorDetail, shouldReportOffline } from "./sync.ts";

describe("sync offline label", () => {
  it("does not treat navigator.onLine alone as offline", () => {
    assert.equal(shouldReportOffline(false, true, true), false);
    assert.equal(shouldReportOffline(false, true, false), false);
  });

  it("shows offline when the request failed and the probe failed", () => {
    assert.equal(shouldReportOffline(true, true, true), true);
    assert.equal(shouldReportOffline(true, false, true), true);
  });

  it("does not show offline when a stuck WebView flag is contradicted by a successful probe", () => {
    assert.equal(shouldReportOffline(true, true, false), false);
    assert.equal(shouldReportOffline(true, false, false), false);
  });

  it("includes the HTTP status in the chip detail", () => {
    assert.equal(serverErrorDetail(503), "השרת החזיר שגיאה 503.");
  });
});
