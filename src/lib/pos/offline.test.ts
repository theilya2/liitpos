import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usePos } from "./store.ts";

function reset() {
  usePos.setState({
    sessionUserId: "u-cashier",
    cart: [],
    discount: null,
    sales: [],
    outbox: [],
    cloudCursor: null,
    lastGoodSync: null,
    appliedReleaseAt: null,
    receiptToPrint: null,
    zToPrint: null,
    held: [],
    zReports: [],
    drawerOpens: [],
    stockMoves: [],
  });
}

describe("offline register", () => {
  it("sells, edits products, prints, reports, and queues every change without a network", () => {
    reset();
    const state = usePos.getState();
    const product = state.products.find((item) => item.active);
    assert.ok(product, "demo catalog is on the device");
    assert.equal(state.addProductToCart(product), true);
    const sale = state.checkout({ method: "cash", tendered: 500 });
    assert.ok(sale);
    assert.notEqual(sale.id, `s_${sale.number}`);
    state.queuePrint(sale);
    assert.equal(usePos.getState().receiptToPrint?.id, sale.id);

    const edited = { ...product, name: "בדיקה אופליין", price: 12.5 };
    state.upsertProduct(edited);
    assert.equal(usePos.getState().products.find((item) => item.id === product.id)?.name, "בדיקה אופליין");

    state.adjustStock(product.id, 2, "receive", "הגעה");
    state.openDrawer();
    const second = usePos.getState().addProductToCart(usePos.getState().products[0]);
    assert.equal(second, true);
    const another = usePos.getState().checkout({ method: "card", tendered: 0, payments: 1 });
    assert.ok(another);
    assert.notEqual(another.id, sale.id);

    const report = usePos.getState().closeZ(1000, 200);
    assert.ok(report);
    assert.equal(report.salesCount >= 1, true);
    usePos.getState().queueZPrint(report);
    assert.equal(usePos.getState().zToPrint?.id, report.id);

    const outbox = usePos.getState().outbox;
    assert.ok(outbox.some((doc) => doc.kind === "sale" && doc.id.endsWith(sale.id)));
    assert.ok(outbox.some((doc) => doc.kind === "sale" && doc.id.endsWith(another.id)));
    assert.ok(outbox.some((doc) => doc.kind === "catalog"));
    assert.ok(outbox.some((doc) => doc.kind === "move"));
    assert.ok(outbox.some((doc) => doc.kind === "z"));
    assert.ok(outbox.some((doc) => doc.kind === "drawer"));
    assert.equal(usePos.getState().sales.filter((item) => item.id === sale.id).length, 1);
  });
});
