import assert from "node:assert/strict";
import test from "node:test";
import { code39Svg } from "@/lib/pos/code39.ts";
import {
  creditBlocker,
  findCredit,
  issueCreditsForTenders,
  lookupCredit,
  newCreditCode,
  redeemCredits,
  selectCredits,
} from "@/lib/pos/credits.ts";
import type { StoreCredit } from "@/lib/pos/types.ts";

const EMPTY = selectCredits(undefined);
const now = Date.parse("2026-10-24T12:00:00.000Z");

function issue(amount: number, code = "Z100001"): StoreCredit {
  const [credit] = issueCreditsForTenders({
    tenders: [{ method: "voucher", amount, voucherCode: code }],
    at: "2026-10-24T05:00:00.000Z",
    saleId: "sale-1",
    saleNumber: 12,
    registerNo: 3,
    registerName: "דלפק",
    businessName: "מכולת",
    token: () => "abcdefghijklmnopqrstuv",
    id: () => "credit-1",
  });
  return credit;
}

test("a voucher refund becomes a scannable credit and partial redemption updates the balance", () => {
  assert.equal(selectCredits(null), EMPTY);
  const credit = issue(40);
  assert.equal(credit.number, "Z100001");
  assert.equal(credit.registerNo, 3);
  assert.equal(credit.balance, 40);
  assert.ok(Date.parse(credit.expiresAt) > Date.parse(credit.issuedAt));
  const partial = redeemCredits([credit], [{ method: "voucher", amount: 15, voucherCode: "z100001" }], {
    at: new Date(now).toISOString(),
    saleId: "sale-2",
    saleNumber: 13,
    registerNo: 3,
  }, now);
  assert.equal(partial.ok, true);
  if (!partial.ok) return;
  assert.equal(partial.credits[0].balance, 25);
  assert.equal(partial.credits[0].original, 40);
  assert.equal(partial.credits[0].redemptions[0].saleNumber, 13);
  const rest = redeemCredits(partial.credits, [
    { method: "voucher", amount: 10, voucherCode: "Z100001" },
    { method: "voucher", amount: 15, voucherCode: "Z100001" },
  ], { at: new Date(now).toISOString(), saleId: "sale-3", saleNumber: 14, registerNo: 3 }, now);
  assert.equal(rest.ok, true);
  if (!rest.ok) return;
  assert.equal(rest.credits[0].balance, 0);
  const over = creditBlocker(partial.credits, [{ method: "voucher", amount: 30, voucherCode: "Z100001" }], now);
  assert.match(over ?? "", /25/);
  const unknown = redeemCredits(partial.credits, [{ method: "voucher", amount: 5, voucherCode: "Z999999" }], {
    at: new Date(now).toISOString(),
    saleId: "sale-4",
    saleNumber: 15,
    registerNo: null,
  }, now);
  assert.equal(unknown.ok, true);
  if (unknown.ok) assert.equal(unknown.credits, partial.credits);
});

test("expired, voided, and empty credits cannot be redeemed", () => {
  const credit = issue(20);
  const expired = { ...credit, expiresAt: "2020-01-01T00:00:00.000Z" };
  assert.match(lookupCredit([expired], "*Z100001*", now).blocked ?? "", /פג/);
  assert.match(creditBlocker([{ ...credit, voided: true }], [{ method: "voucher", amount: 5, voucherCode: "Z100001" }], now) ?? "", /בוטל/);
  assert.match(creditBlocker([{ ...credit, balance: 0 }], [{ method: "voucher", amount: 5, voucherCode: "Z100001" }], now) ?? "", /מומש/);
  assert.equal(lookupCredit([credit], "קולה", now).credit, null);
  assert.equal(findCredit([credit], "Z100001")?.token, "abcdefghijklmnopqrstuv");
  assert.match(code39Svg("Z100001"), /<svg/);
  const codes = [newCreditCode([])];
  assert.match(codes[0], /^Z\d{6}$/);
});
