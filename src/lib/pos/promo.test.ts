import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTotals } from "./money.ts";
import { cleanPromos, priceCart, pricedOrPlain, promoOpen, quotePromos } from "./promo.ts";
import type { CartLine, Product, Promo } from "./types.ts";

function product(id: string, price: number, categoryId = "drinks"): Product {
  return {
    id,
    name: id,
    price,
    categoryId,
    sku: "",
    favorite: false,
    active: true,
    image: null,
    trackStock: false,
    stock: 0,
    lowStock: 0,
    shelf: "off",
    kiosk: false,
    extras: [],
  };
}

function line(productId: string, price: number, qty: number): CartLine {
  return { key: productId + qty, productId, name: productId, unitPrice: price, qty };
}

function promo(partial: Partial<Promo> & Pick<Promo, "kind">): Promo {
  return {
    id: partial.id ?? "p",
    name: partial.name ?? "מבצע",
    active: partial.active ?? true,
    kind: partial.kind,
    stackable: partial.stackable ?? false,
    productId: partial.productId ?? "",
    categoryId: partial.categoryId ?? "",
    rewardProductId: partial.rewardProductId ?? "",
    buyQty: partial.buyQty ?? 1,
    getQty: partial.getQty ?? 1,
    bundlePrice: partial.bundlePrice ?? 0,
    percent: partial.percent ?? 0,
    amount: partial.amount ?? 0,
    days: partial.days ?? [],
    startTime: partial.startTime ?? "",
    endTime: partial.endTime ?? "",
    startDate: partial.startDate ?? "",
    endDate: partial.endDate ?? "",
  };
}

const monday = new Date(2026, 5, 15, 14, 30);

describe("promo math", () => {
  const coffee = product("coffee", 10);
  const cookie = product("cookie", 4, "bakery");
  const sandwich = product("sandwich", 20, "food");

  it("gives the cheaper unit free on 1+1", () => {
    const lines = [line("coffee", 10, 1), line("coffee", 8, 1)];
    const quote = quotePromos(lines, [coffee], [promo({ kind: "bogo", productId: "coffee" })], monday);
    assert.equal(quote.amount, 8);
    assert.equal(quotePromos([line("coffee", 10, 3)], [coffee], [promo({ kind: "bogo", productId: "coffee" })], monday).amount, 10);
  });

  it("buys X and gets Y of the same item", () => {
    const rule = promo({ kind: "bxgy", productId: "coffee", buyQty: 2, getQty: 1 });
    assert.equal(quotePromos([line("coffee", 10, 2)], [coffee], [rule], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 10, 3)], [coffee], [rule], monday).amount, 10);
    assert.equal(quotePromos([line("coffee", 10, 6)], [coffee], [rule], monday).amount, 20);
  });

  it("buys X and gets a different item, cheapest first", () => {
    const rule = promo({ kind: "bxgy", productId: "coffee", rewardProductId: "cookie", buyQty: 2, getQty: 1 });
    const products = [coffee, cookie];
    assert.equal(quotePromos([line("coffee", 10, 2), line("cookie", 4, 1)], products, [rule], monday).amount, 4);
    assert.equal(quotePromos([line("coffee", 10, 2)], products, [rule], monday).amount, 0);
    assert.equal(
      quotePromos([line("coffee", 10, 2), line("cookie", 8, 1), line("cookie", 3, 1)], products, [rule], monday).amount,
      3,
    );
  });

  it("prices a quantity bundle, for example 3 for 10", () => {
    const rule = promo({ kind: "bundle", productId: "coffee", buyQty: 3, bundlePrice: 10 });
    assert.equal(quotePromos([line("coffee", 5, 1), line("coffee", 6, 1), line("coffee", 7, 1)], [coffee], [rule], monday).amount, 8);
    assert.equal(quotePromos([line("coffee", 5, 2)], [coffee], [rule], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 5, 3)], [coffee], [promo({ kind: "bundle", productId: "coffee", buyQty: 3, bundlePrice: 0 })], monday).amount, 0);
  });

  it("takes a percent or a fixed amount off a category, capped at that category", () => {
    const products = [coffee, sandwich];
    const lines = [line("coffee", 10, 1), line("sandwich", 20, 1)];
    assert.equal(quotePromos(lines, products, [promo({ kind: "percent", categoryId: "drinks", percent: 10 })], monday).amount, 1);
    assert.equal(quotePromos(lines, products, [promo({ kind: "amount", categoryId: "drinks", amount: 15 })], monday).amount, 10);
  });

  it("stays closed outside the happy hour, weekday, or dates", () => {
    const open = promo({ kind: "percent", productId: "coffee", percent: 50, startTime: "14:00", endTime: "16:00", days: [1], startDate: "2026-06-15", endDate: "2026-06-15" });
    const lines = [line("coffee", 10, 1)];
    assert.equal(quotePromos(lines, [coffee], [open], monday).amount, 5);
    assert.equal(quotePromos(lines, [coffee], [open], new Date(2026, 5, 15, 16, 0)).amount, 0);
    assert.equal(quotePromos(lines, [coffee], [{ ...open, days: [0] }], monday).amount, 0);
    assert.equal(quotePromos(lines, [coffee], [{ ...open, startDate: "2026-06-16" }], monday).amount, 0);
    assert.equal(quotePromos(lines, [coffee], [{ ...open, endDate: "2026-06-14" }], monday).amount, 0);
    assert.equal(promoOpen({ ...open, active: false }, monday), false);
    const night = promo({ kind: "percent", productId: "coffee", percent: 10, startTime: "22:00", endTime: "02:00" });
    assert.equal(promoOpen(night, new Date(2026, 5, 15, 23, 30)), true);
    assert.equal(promoOpen(night, new Date(2026, 5, 15, 1, 30)), true);
    assert.equal(promoOpen(night, new Date(2026, 5, 15, 3, 0)), false);
  });

  it("keeps the best exclusive deal and stacks only when allowed", () => {
    const lines = [line("coffee", 10, 2)];
    const half = promo({ id: "half", name: "חצי", kind: "percent", productId: "coffee", percent: 50 });
    const small = promo({ id: "small", name: "קטן", kind: "amount", productId: "coffee", amount: 3 });
    const ten = promo({ id: "ten", name: "עשר", kind: "percent", productId: "coffee", percent: 10, stackable: true });
    const two = promo({ id: "two", name: "שתיים", kind: "amount", productId: "coffee", amount: 2, stackable: true });
    const exclusive = quotePromos(lines, [coffee], [half, small], monday);
    assert.equal(exclusive.amount, 10);
    assert.deepEqual(exclusive.hits.map((hit) => hit.id), ["half"]);
    const stacked = quotePromos(lines, [coffee], [ten, two], monday);
    assert.equal(stacked.amount, 4);
    assert.equal(stacked.hits.length, 2);
    const mixed = quotePromos(lines, [coffee], [half, ten, two], monday);
    assert.equal(mixed.amount, 10);
    assert.deepEqual(mixed.hits.map((hit) => hit.id), ["half"]);
    const weaker = quotePromos(lines, [coffee], [small, ten, two], monday);
    assert.equal(weaker.amount, 4);
    assert.equal(weaker.hits.some((hit) => hit.id === "small"), false);
    const capped = quotePromos(lines, [coffee], [
      promo({ id: "a", kind: "percent", productId: "coffee", percent: 80, stackable: true }),
      promo({ id: "b", kind: "percent", productId: "coffee", percent: 80, stackable: true }),
    ], monday);
    assert.equal(capped.amount, 20);
  });

  it("applies the promotion before a manual discount and leaves an old cart unchanged", () => {
    const lines = [line("coffee", 10, 2)];
    const priced = priceCart(lines, [coffee], [promo({ kind: "bogo", name: "1+1", productId: "coffee" })], { kind: "percent", value: 10 }, 18, monday);
    assert.equal(priced.promoAmount, 10);
    assert.equal(priced.discountAmount, 1);
    assert.equal(priced.total, 9);
    assert.equal(priced.promoLabel, "1+1");
    assert.equal(priced.vat, 1.37);
    const plain = pricedOrPlain(lines, [coffee], undefined, { kind: "percent", value: 10 }, 18);
    assert.deepEqual(
      { gross: plain.gross, discountAmount: plain.discountAmount, total: plain.total, vat: plain.vat, net: plain.net },
      computeTotals(lines, { kind: "percent", value: 10 }, 18),
    );
    assert.equal(plain.promoAmount, 0);
  });

  it("prices a sized line and a modifier on top of that size", () => {
    const lines = [
      { ...line("coffee", 8, 1), key: "small" },
      { ...line("coffee", 13, 1), key: "large-oat" },
    ];
    const quote = quotePromos(lines, [coffee], [promo({ kind: "bogo", productId: "coffee" })], monday);
    assert.equal(quote.amount, 8);
    const percent = quotePromos(lines, [coffee], [promo({ kind: "percent", categoryId: "drinks", percent: 10 })], monday);
    assert.equal(percent.amount, 2.1);
  });

  it("drops a promo that has no name or no target", () => {
    const cleaned = cleanPromos([
      { name: "  ", kind: "bogo", productId: "coffee" },
      { name: "שלום", kind: "nope" },
      { name: "עשר", kind: "percent", productId: "coffee", percent: 150, days: [1, 9, 1] },
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].percent, 100);
    assert.deepEqual(cleaned[0].days, [1, 1]);
    assert.equal(quotePromos([line("coffee", 10, 1)], [coffee], [promo({ kind: "percent", percent: 50 })], monday).amount, 0);
  });
});
