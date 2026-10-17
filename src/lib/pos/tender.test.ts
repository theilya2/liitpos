import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usePos } from "./store.ts";
import { foldTenders, previewTender, quoteRefund, refundedQty, settleSale, tendersOf, zFigures } from "./tender.ts";
import type { Sale, SaleLine } from "./types.ts";

function line(name: string, unitPrice: number, qty: number, productId: string | null = "p1"): SaleLine {
  return { productId, name, unitPrice, qty, lineTotal: Math.round(unitPrice * qty * 100) / 100 };
}

function sale(partial: Partial<Sale> & Pick<Sale, "lines" | "total" | "amountDue">): Sale {
  return {
    id: "sale-1",
    number: 1001,
    createdAt: "2026-01-01T00:00:00.000Z",
    discountAmount: 0,
    vatRate: 18,
    vatAmount: 0,
    net: partial.total,
    method: "cash",
    rounding: 0,
    tendered: partial.amountDue,
    change: 0,
    voided: false,
    zId: null,
    cashierName: "נועה",
    business: { businessName: "חנות", ownerName: "", taxId: "", address: "", phone: "", receiptFooter: "" },
    ...partial,
  };
}

describe("split tender", () => {
  it("migrates an old single-method sale into one tender", () => {
    const old = sale({ lines: [line("קפה", 10, 1)], total: 10, amountDue: 10, method: "bit", tendered: 10 });
    const tenders = tendersOf(old);
    assert.equal(tenders.length, 1);
    assert.equal(tenders[0].method, "bit");
    assert.equal(tenders[0].amount, 10);
    assert.equal(tenders[0].change, 0);
  });

  it("closes only when the remainder is zero and keeps change on the cash slice", () => {
    const open = foldTenders(30.07, [{ method: "card", tendered: 20 }]);
    assert.ok(open);
    assert.equal(open.remaining, 10.07);
    assert.equal(settleSale(30.07, [{ method: "card", tendered: 20 }]), null);
    assert.equal(previewTender(10.07, { method: "bit", tendered: 11 }), null);

    const closed = settleSale(30.07, [
      { method: "card", tendered: 20, payments: 3 },
      { method: "cash", tendered: 50 },
    ]);
    assert.ok(closed);
    assert.equal(closed.tenders[0].amount, 20);
    assert.equal(closed.tenders[0].change, 0);
    assert.equal(closed.tenders[0].payments, 3);
    assert.equal(closed.tenders[1].method, "cash");
    assert.equal(closed.tenders[1].amount, 10.1);
    assert.equal(closed.tenders[1].change, 39.9);
    assert.equal(closed.tenders[1].rounding, 0.03);
    assert.equal(closed.change, 39.9);
    assert.equal(closed.amountDue, 30.1);
  });

  it("rounds a cash-only sale the same way as before", () => {
    const closed = settleSale(10.03, [{ method: "cash", tendered: 20 }]);
    assert.ok(closed);
    assert.equal(closed.tenders[0].amount, 10);
    assert.equal(closed.tenders[0].change, 10);
    assert.equal(closed.rounding, -0.03);
    assert.equal(settleSale(10.03, [{ method: "cash", tendered: 9.9 }]), null);
  });
});

describe("refund limits", () => {
  const original = sale({
    lines: [line("קפה", 10, 2), line("עוגה", 20, 1, "p2")],
    total: 40,
    amountDue: 40,
    method: "card",
    vatAmount: 6.1,
    net: 33.9,
  });

  it("refuses more than what is still unsold-back", () => {
    assert.equal(quoteRefund(original, [], [{ index: 0, qty: 3 }]), null);
    const first = quoteRefund(original, [], [{ index: 0, qty: 1 }]);
    assert.ok(first);
    assert.equal(first.total, 10);
    const credit = sale({
      id: "credit-1",
      kind: "credit",
      creditOfId: original.id,
      lines: [{ ...line("קפה", 10, 1), sourceIndex: 0 }],
      total: 10,
      amountDue: 10,
    });
    assert.equal(refundedQty(original.id, [credit], 0), 1);
    assert.equal(quoteRefund(original, [credit], [{ index: 0, qty: 2 }]), null);
    const rest = quoteRefund(original, [credit], [
      { index: 0, qty: 1 },
      { index: 1, qty: 1 },
    ]);
    assert.ok(rest);
    assert.equal(rest.total, 30);
  });

  it("gives the last refund the money still on the sale, including a discount", () => {
    const discounted = sale({
      ...original,
      discountAmount: 4,
      total: 36,
      amountDue: 36,
    });
    const partial = quoteRefund(discounted, [], [{ index: 1, qty: 1 }]);
    assert.ok(partial);
    assert.equal(partial.total, 18);
    const note = sale({
      id: "credit-2",
      kind: "credit",
      creditOfId: discounted.id,
      lines: partial.lines,
      total: partial.total,
      amountDue: partial.total,
    });
    const last = quoteRefund(discounted, [note], [{ index: 0, qty: 2 }]);
    assert.ok(last);
    assert.equal(last.total, 18);
  });
});

describe("Z totals", () => {
  it("nets each method and keeps credit notes out of the sale count", () => {
    const sold = sale({
      lines: [line("קפה", 30.07, 1)],
      total: 30.07,
      amountDue: 30.1,
      rounding: 0.03,
      method: "cash",
      tenders: [
        { method: "card", amount: 20, tendered: 20, change: 0, rounding: 0 },
        { method: "cash", amount: 10.1, tendered: 50, change: 39.9, rounding: 0.03 },
      ],
      vatAmount: 4.59,
      net: 25.48,
    });
    const credit = sale({
      id: "credit-1",
      kind: "credit",
      creditOfId: sold.id,
      lines: [{ ...line("קפה", 10, 1), sourceIndex: 0 }],
      total: 10,
      amountDue: 10,
      method: "cash",
      tenders: [{ method: "cash", amount: 10, tendered: 10, change: 0, rounding: 0 }],
      vatAmount: 1.53,
      net: 8.47,
    });
    const figures = zFigures([sold, credit, { ...sold, id: "voided", voided: true }]);
    assert.equal(figures.salesCount, 1);
    assert.equal(figures.voidCount, 1);
    assert.equal(figures.creditCount, 1);
    assert.equal(figures.gross, 30.1);
    assert.equal(figures.creditTotal, 10);
    assert.equal(figures.turnover, 20.1);
    const card = figures.byMethod.find((row) => row.method === "card");
    const cash = figures.byMethod.find((row) => row.method === "cash");
    assert.equal(card?.sales, 20);
    assert.equal(card?.refunds, 0);
    assert.equal(card?.total, 20);
    assert.equal(cash?.sales, 10.1);
    assert.equal(cash?.refunds, 10);
    assert.equal(cash?.total, 0.1);
    assert.equal(figures.cashTaken, 0.1);
  });
});

describe("register refund permission", () => {
  it("lets a manager refund part of a sale and blocks a cashier and a second return of the same units", () => {
    usePos.setState({
      sessionUserId: "u-cashier",
      cart: [],
      discount: null,
      sales: [],
      outbox: [],
      zReports: [],
      stockMoves: [],
      nextCredit: 1,
    });
    const product = usePos.getState().products.find((item) => item.trackStock && item.active && item.stock >= 2 && Math.round(item.price * 10) === item.price * 10);
    assert.ok(product);
    const before = product.stock;
    assert.equal(usePos.getState().addProductToCart(product), true);
    assert.equal(usePos.getState().addProductToCart(product), true);
    const sold = usePos.getState().checkout({
      tenders: [
        { method: "card", tendered: product.price },
        { method: "cash", tendered: 200 },
      ],
    });
    assert.ok(sold);
    assert.equal(sold.tenders?.length, 2);
    assert.equal(usePos.getState().refundSale({ saleId: sold.id, lines: [{ index: 0, qty: 1 }], tenders: [{ method: "cash", tendered: product.price }] }), null);
    usePos.setState({ sessionUserId: "u-manager" });
    const note = usePos.getState().refundSale({
      saleId: sold.id,
      lines: [{ index: 0, qty: 1 }],
      tenders: [{ method: "cash", tendered: product.price }],
    });
    assert.ok(note);
    assert.equal(note.kind, "credit");
    assert.equal(note.creditOfId, sold.id);
    assert.equal(note.number, 1);
    assert.equal(usePos.getState().products.find((item) => item.id === product.id)?.stock, before - 1);
    assert.equal(
      usePos.getState().refundSale({ saleId: sold.id, lines: [{ index: 0, qty: 2 }], tenders: [{ method: "cash", tendered: product.price * 2 }] }),
      null,
    );
    const again = usePos.getState().refundSale({
      saleId: sold.id,
      lines: [{ index: 0, qty: 1 }],
      tenders: [{ method: "voucher", tendered: product.price }],
    });
    assert.ok(again);
    assert.equal(again.tenders?.[0].method, "voucher");
    assert.ok(again.tenders?.[0].voucherCode);
    const report = usePos.getState().closeZ(500, 100);
    assert.ok(report);
    assert.equal(report.salesCount, 1);
    assert.equal(report.creditCount, 2);
    assert.equal(report.turnover, 0);
    assert.equal(usePos.getState().voidSale(sold.id), undefined);
    assert.equal(usePos.getState().sales.find((item) => item.id === sold.id)?.voided, false);
  });
});
