import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { versionFromTag } from "./release-version.ts";

describe("versionFromTag", () => {
  it("reads the version code from the automatic release tag", () => {
    assert.deepEqual(versionFromTag("v1.0.1001"), { versionCode: 1001, versionName: "1.0.1001" });
  });

  it("reads an explicit plus code", () => {
    assert.deepEqual(versionFromTag("v2.3.0+240"), { versionCode: 240, versionName: "2.3.0+240" });
  });

  it("rejects a tag with no number", () => {
    assert.equal(versionFromTag("vlatest"), null);
    assert.equal(versionFromTag(""), null);
  });
});
