import assert from "node:assert/strict";
import test from "node:test";
import { discountLabel, discountLinesOf, formatDiscountAmount, manualDiscountRow, savedDiscountLine } from "@/lib/pos/discount-line.ts";
import { receiptPrintLines } from "@/lib/pos/printer.ts";
import { receiptSmsBody } from "@/lib/pos/receipt-link.ts";
import { cloneSettings } from "@/lib/pos/seed.ts";
import type { Sale } from "@/lib/pos/types.ts";

test("a percent discount is its own labeled line", () => {
  const row = manualDiscountRow({ kind: "percent", value: 10 }, 1.5);
  assert.deepEqual(row, { name: "הנחה 10%", amount: 1.5 });
  assert.match(formatDiscountAmount(1.5), /-/);
  assert.equal(manualDiscountRow({ kind: "percent", value: 10 }, 0), null);
});

test("a shekel discount names the amount", () => {
  assert.equal(discountLabel({ kind: "amount", value: 5 }), "הנחה ₪5");
  assert.equal(discountLabel({ kind: "amount", value: 5.5 }), "הנחה ₪5.5");
  assert.equal(discountLabel(null), "הנחה");
});

test("the Z report groups manual discounts and skips voids and credit notes", () => {
  const lines = discountLinesOf([
    { discountAmount: 2, discountLabel: "הנחה 10%" },
    { discountAmount: 3, discountLabel: "הנחה 10%" },
    { discountAmount: 5, discountLabel: "הנחה ₪5" },
    { discountAmount: 9, discountLabel: "הנחה 10%", voided: true },
    { discountAmount: 4, discountLabel: "הנחה 10%", kind: "credit" },
    { discountAmount: 0 },
  ]);
  assert.deepEqual(lines, [
    { name: "הנחה 10%", amount: 5 },
    { name: "הנחה ₪5", amount: 5 },
  ]);
  assert.equal(savedDiscountLine({ discountAmount: 2 })?.name, "הנחה");
});

test("the printed and SMS receipt text keeps the discount line", () => {
  const settings = cloneSettings();
  const sale: Sale = {
    id: "sale-1",
    number: 12,
    createdAt: "2026-04-02T10:30:00.000Z",
    lines: [{ productId: null, name: "קפה", unitPrice: 10, qty: 1, lineTotal: 10 }],
    discountAmount: 1,
    discountLabel: "הנחה 10%",
    total: 9,
    vatRate: 18,
    vatAmount: 1.37,
    net: 7.63,
    method: "cash",
    amountDue: 9,
    rounding: 0,
    tendered: 10,
    change: 1,
    voided: false,
    zId: null,
    cashierName: "נועה",
    business: settings,
  };
  const lines = receiptPrintLines(sale);
  const discount = lines.find((line) => line.text.includes("הנחה 10%"));
  assert.ok(discount);
  assert.equal(discount?.align, "split");
  assert.ok(discount?.text.includes(formatDiscountAmount(1)));
  assert.match(receiptSmsBody(sale, null), /הנחה 10%/);
});
