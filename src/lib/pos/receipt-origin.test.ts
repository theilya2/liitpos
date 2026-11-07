import assert from "node:assert/strict";
import test from "node:test";
import { receiptOrigin, receiptUrl } from "./receipt-link.ts";

test("receipt links stay on the Vercel host when no public origin is configured", () => {
  assert.equal(receiptOrigin(), "https://liitpos.vercel.app");
  assert.equal(receiptUrl("abcdefghij1234567890AB"), "https://liitpos.vercel.app/r/abcdefghij1234567890AB");
});
