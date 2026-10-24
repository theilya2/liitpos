import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTotals } from "./money.ts";
import { cleanPromos, priceCart, pricedOrPlain, promoHeadline, promoOpen, promoPlan, quotePromos, selectPromos } from "./promo.ts";
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
    rewardPercent: partial.rewardPercent ?? 100,
    productIds: partial.productIds ?? [],
    minSpend: partial.minSpend ?? 0,
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

  it("discounts the cheaper item in each group when the Nth is a percent off", () => {
    const rule = promo({ kind: "nth", productId: "coffee", buyQty: 2, percent: 50 });
    assert.equal(quotePromos([line("coffee", 10, 1)], [coffee], [rule], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 10, 2)], [coffee], [rule], monday).amount, 5);
    const mixed = quotePromos(
      [
        { ...line("coffee", 14, 1), key: "large" },
        { ...line("coffee", 10, 1), key: "small" },
        { ...line("coffee", 8, 1), key: "tiny" },
      ],
      [coffee],
      [rule],
      monday,
    );
    assert.equal(mixed.amount, 5);
    const withModifier = quotePromos(
      [
        { ...line("coffee", 18, 1), key: "oat", modifiers: [{ groupId: "milk", optionId: "oat", name: "שיבולת", price: 4 }] },
        { ...line("coffee", 12, 1), key: "plain" },
      ],
      [coffee],
      [rule],
      monday,
    );
    assert.equal(withModifier.amount, 6);
  });

  it("discounts the reward instead of making it free", () => {
    const half = promo({ kind: "bxgy", productId: "coffee", buyQty: 2, getQty: 1, rewardPercent: 50 });
    assert.equal(quotePromos([line("coffee", 10, 3)], [coffee], [half], monday).amount, 5);
    const other = promo({ kind: "bxgy", productId: "coffee", rewardProductId: "cookie", buyQty: 2, getQty: 1, rewardPercent: 50 });
    assert.equal(quotePromos([line("coffee", 10, 2), line("cookie", 4, 1)], [coffee, cookie], [other], monday).amount, 2);
    assert.equal(quotePromos([line("coffee", 10, 2), line("cookie", 8, 1), line("cookie", 4, 1)], [coffee, cookie], [other], monday).amount, 2);
  });

  it("prices a combo of different products, including a sized line", () => {
    const rule = promo({ kind: "combo", name: "קומבו", productIds: ["coffee", "cookie"], bundlePrice: 11 });
    assert.equal(quotePromos([line("coffee", 10, 1)], [coffee, cookie], [rule], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 10, 1), line("cookie", 4, 1)], [coffee, cookie], [rule], monday).amount, 3);
    const sized = quotePromos(
      [
        { ...line("coffee", 16, 1), key: "large", variantId: "large" },
        { ...line("cookie", 4, 1), key: "cookie" },
      ],
      [coffee, cookie],
      [rule],
      monday,
    );
    assert.equal(sized.amount, 9);
    assert.equal(quotePromos([line("coffee", 10, 2), line("cookie", 4, 2)], [coffee, cookie], [rule], monday).amount, 6);
  });

  it("takes a percent or an amount off once the cart crosses a threshold", () => {
    const percent = promo({ kind: "threshold", minSpend: 30, percent: 10 });
    const products = [coffee, sandwich];
    assert.equal(quotePromos([line("coffee", 10, 2)], products, [percent], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 10, 1), line("sandwich", 20, 1)], products, [percent], monday).amount, 3);
    const capped = promo({ kind: "threshold", minSpend: 20, amount: 50 });
    assert.equal(quotePromos([line("coffee", 10, 2)], products, [capped], monday).amount, 20);
    const drinks = promo({ kind: "threshold", categoryId: "drinks", minSpend: 20, percent: 50 });
    assert.equal(quotePromos([line("coffee", 10, 1), line("sandwich", 20, 1)], products, [drinks], monday).amount, 0);
    assert.equal(quotePromos([line("coffee", 12, 2)], products, [drinks], monday).amount, 12);
  });

  it("applies exclusive deals on different products together and still refuses a double dip", () => {
    const lines = [line("coffee", 10, 1), line("cookie", 4, 1)];
    const products = [coffee, cookie];
    const half = promo({ id: "half", name: "חצי", kind: "percent", productId: "coffee", percent: 50 });
    const two = promo({ id: "two", name: "שתיים", kind: "amount", productId: "cookie", amount: 2 });
    const both = quotePromos(lines, products, [half, two], monday);
    assert.equal(both.amount, 7);
    assert.deepEqual(both.hits.map((hit) => hit.id).sort(), ["half", "two"]);
    const bogo = promo({ id: "bogo", name: "1+1", kind: "bogo", productId: "coffee" });
    const alsoHalf = promo({ id: "half", name: "חצי", kind: "percent", productId: "coffee", percent: 50 });
    const same = quotePromos([line("coffee", 10, 2)], [coffee], [bogo, alsoHalf], monday);
    assert.equal(same.amount, 10);
    assert.equal(same.hits.length, 1);
  });

  it("names the card and knows which products a tap should add", () => {
    assert.equal(promoHeadline(promo({ kind: "bundle", buyQty: 3, bundlePrice: 10 })), "3 ב-10");
    assert.equal(promoHeadline(promo({ kind: "nth", buyQty: 2, percent: 50 })), "השני ב-50%");
    assert.equal(promoHeadline(promo({ kind: "bogo" })), "1+1");
    assert.equal(promoHeadline(promo({ kind: "bxgy", buyQty: 2, getQty: 1, rewardPercent: 100 })), "קנה 2 קבל 1");
    assert.equal(promoHeadline(promo({ kind: "bxgy", buyQty: 2, getQty: 1, rewardPercent: 50 })), "קנה 2 קבל 1 ב-50%");
    assert.equal(promoHeadline(promo({ kind: "combo", bundlePrice: 25 })), "קומבו 25");
    assert.equal(promoHeadline(promo({ kind: "threshold", minSpend: 100, percent: 10 })), "מ-100 ₪ 10%");
    const set = promoPlan(promo({ kind: "bogo", productId: "coffee" }));
    assert.deepEqual(set, { mode: "set", items: [{ productId: "coffee", qty: 2 }] });
    const reward = promoPlan(promo({ kind: "bxgy", productId: "coffee", rewardProductId: "cookie", buyQty: 2, getQty: 1 }));
    assert.deepEqual(reward, {
      mode: "set",
      items: [
        { productId: "coffee", qty: 2 },
        { productId: "cookie", qty: 1 },
      ],
    });
    const category = promoPlan(promo({ kind: "percent", categoryId: "drinks", percent: 10 }));
    assert.equal(category.mode, "choose");
    assert.equal(promoPlan(promo({ kind: "threshold", minSpend: 50, amount: 5 })).mode, "info");
  });

  it("keeps one empty promotion list for selectors", () => {
    assert.equal(selectPromos(undefined), selectPromos(undefined));
    const list = [promo({ kind: "bogo", productId: "coffee" })];
    assert.equal(selectPromos(list), list);
  });

  it("drops a promo that has no name or no target", () => {
    const cleaned = cleanPromos([
      { name: "  ", kind: "bogo", productId: "coffee" },
      { name: "שלום", kind: "nope" },
      { name: "עשר", kind: "percent", productId: "coffee", percent: 150, days: [1, 9, 1] },
      { name: "קומבו", kind: "combo", productIds: ["coffee", "cookie", 4], bundlePrice: 12 },
      { name: "סף", kind: "threshold", minSpend: 40, amount: 5 },
    ]);
    assert.equal(cleaned.length, 3);
    assert.equal(cleaned[0].percent, 100);
    assert.equal(cleaned[0].rewardPercent, 100);
    assert.deepEqual(cleaned[0].productIds, []);
    assert.deepEqual(cleaned[0].days, [1, 1]);
    assert.deepEqual(cleaned[1].productIds, ["coffee", "cookie"]);
    assert.equal(cleaned[2].minSpend, 40);
    assert.equal(quotePromos([line("coffee", 10, 1)], [coffee], [promo({ kind: "percent", percent: 50 })], monday).amount, 0);
  });
});
