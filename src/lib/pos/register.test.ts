import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextRegisterNo, registerCaption, registerStamp, REVOKED_DETAIL } from "./register.ts";

describe("register numbers", () => {
  it("starts at 1 and does not reuse a revoked number", () => {
    assert.equal(nextRegisterNo([]), 1);
    assert.equal(nextRegisterNo([1, 2]), 3);
    assert.equal(nextRegisterNo([1, 3]), 4);
  });

  it("labels the register for receipts and the top bar", () => {
    assert.equal(registerCaption(2, ""), "קופה 2");
    assert.equal(registerCaption(2, " דלפק "), "קופה 2 · דלפק");
    assert.equal(registerCaption(null, "דלפק"), "");
  });

  it("tags sales only for the business this device is paired to", () => {
    const bound = {
      registerNo: 2,
      registerName: "דלפק",
      registerBusinessId: "store-a",
      registerRevoked: false,
      activeStoreId: "store-a",
    };
    assert.deepEqual(registerStamp(bound), { registerNo: 2, registerName: "דלפק" });
    assert.equal(registerStamp({ ...bound, activeStoreId: "store-b" }), null);
    assert.equal(registerStamp({ ...bound, registerRevoked: true }), null);
    assert.equal(registerStamp({ ...bound, registerNo: null }), null);
  });

  it("uses the manager disconnect sentence", () => {
    assert.equal(REVOKED_DETAIL, 'הקופה נותקה ע"י המנהל');
  });
});
