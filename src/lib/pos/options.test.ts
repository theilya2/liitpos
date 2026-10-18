import assert from "node:assert/strict";
import test from "node:test";
import { buildConfiguredLine, cleanGroups, groupsFor, hasEnough, changeStock, soldItems, stockRows } from "@/lib/pos/options.ts";
import type { Product, Sale } from "@/lib/pos/types.ts";

function drink(): Product {
  return {
    id: "cola",
    name: "קולה",
    price: 8,
    categoryId: "cold",
    sku: "2101",
    favorite: false,
    active: true,
    image: null,
    trackStock: true,
    stock: 20,
    lowStock: 2,
    shelf: "upper",
    kiosk: true,
    extras: [],
    variants: [
      { id: "s", name: "קטן", price: 8, sku: "2101S", barcode: "7290001", stock: 4, active: true },
      { id: "l", name: "גדול", price: 12, sku: "2101L", barcode: "7290002", stock: 1, active: true },
    ],
    modifierGroups: [
      {
        id: "ice",
        name: "קרח",
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: "yes", name: "עם קרח", price: 0 },
          { id: "no", name: "בלי קרח", price: 0 },
        ],
      },
      {
        id: "shot",
        name: "תוספת",
        required: false,
        min: 0,
        max: 2,
        options: [
          { id: "lemon", name: "לימון", price: 1 },
          { id: "mint", name: "נענע", price: 2 },
        ],
      },
    ],
  };
}

test("a size has its own price and a required group blocks an empty choice", () => {
  const product = drink();
  assert.equal(buildConfiguredLine({ product, picks: [], qty: 1 }), null);
  const line = buildConfiguredLine({
    product,
    variantId: "l",
    picks: [
      { groupId: "ice", optionId: "yes" },
      { groupId: "shot", optionId: "lemon" },
    ],
    qty: 2,
  });
  assert.ok(line);
  assert.equal(line?.unitPrice, 13);
  assert.equal(line?.name, "קולה · גדול · עם קרח · לימון");
  assert.equal(line?.sku, "2101L");
  assert.equal(line?.qty, 2);
});

test("up to N refuses a third option and exactly-one stays a single choice", () => {
  const groups = cleanGroups([
    { id: "g", name: "רמה", required: false, min: 0, max: 2, options: [
      { id: "a", name: "א", price: 1 },
      { id: "b", name: "ב", price: 1 },
      { id: "c", name: "ג", price: 1 },
    ] },
  ]);
  assert.equal(groups[0]?.max, 2);
  const product = { ...drink(), variants: [], modifierGroups: groups };
  const tooMany = buildConfiguredLine({
    product,
    picks: [
      { groupId: "g", optionId: "a" },
      { groupId: "g", optionId: "b" },
      { groupId: "g", optionId: "c" },
    ],
    qty: 1,
  });
  assert.equal(tooMany, null);
  const exact = cleanGroups([{ name: "גודל", required: true, min: 1, max: 1, options: [{ name: "רגיל", price: 0 }] }]);
  assert.equal(exact[0]?.min, 1);
  assert.equal(exact[0]?.max, 1);
});

test("older extras stay optional and parent stock is not the size stock", () => {
  const legacy: Product = { ...drink(), variants: [], modifierGroups: [], extras: [{ id: "oat", name: "שיבולת", price: 3 }] };
  const groups = groupsFor(legacy);
  assert.equal(groups[0]?.required, false);
  assert.equal(groups[0]?.min, 0);
  const plain = buildConfiguredLine({ product: legacy, picks: [], qty: 1 });
  assert.equal(plain?.unitPrice, 8);
  assert.equal(plain?.name, "קולה");
  const withExtra = buildConfiguredLine({ product: legacy, picks: [{ groupId: "legacy-extras", optionId: "oat" }], qty: 1 });
  assert.equal(withExtra?.unitPrice, 11);

  const product = drink();
  assert.equal(hasEnough(product, null, 1), false);
  assert.equal(hasEnough(product, "l", 2), false);
  assert.equal(hasEnough(product, "l", 1), true);
  const next = changeStock(product, "l", -1);
  assert.equal(next.product.variants?.find((variant) => variant.id === "l")?.stock, 0);
  assert.equal(next.product.variants?.find((variant) => variant.id === "s")?.stock, 4);
  assert.equal(next.product.stock, 20);
  const rows = stockRows([product]);
  assert.deepEqual(rows.map((row) => row.name), ["קולה · קטן", "קולה · גדול"]);
});

test("reports keep the variant and modifiers on the sold line", () => {
  const sale = {
    voided: false,
    kind: "sale",
    lines: [{ productId: "cola", variantId: "l", name: "קולה · גדול · עם קרח", qty: 2, unitPrice: 12, lineTotal: 24 }],
  } as Sale;
  const credit = {
    voided: false,
    kind: "credit",
    lines: [{ productId: "cola", variantId: "l", name: "קולה · גדול · עם קרח", qty: 1, unitPrice: 12, lineTotal: 12 }],
  } as Sale;
  const rows = soldItems([sale, credit]);
  assert.equal(rows[0]?.name, "קולה · גדול · עם קרח");
  assert.equal(rows[0]?.qty, 1);
  assert.equal(rows[0]?.total, 12);
});
