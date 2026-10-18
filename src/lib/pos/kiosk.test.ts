import assert from "node:assert/strict";
import test from "node:test";
import { attractImages, kioskTiming, upsellSuggestions } from "@/lib/pos/kiosk.ts";
import type { Product, Sale } from "@/lib/pos/types.ts";

function product(id: string, categoryId: string, favorite = false): Product {
  return {
    id,
    name: id,
    price: 10,
    categoryId,
    sku: id,
    favorite,
    active: true,
    image: null,
    trackStock: false,
    stock: 0,
    lowStock: 0,
    shelf: "off",
    kiosk: true,
    extras: [],
  };
}

test("kiosk idle defaults stay at 60 and 15 when settings are old", () => {
  assert.deepEqual(kioskTiming({}), { idle: 60, warn: 15, lock: false });
  assert.deepEqual(kioskTiming({ kioskIdleSec: 3, kioskWarnSec: 200, kioskLock: true }), { idle: 15, warn: 90, lock: true });
});

test("upsell uses a product pairing, then a category, then best sellers", () => {
  const coffee = product("coffee", "hot");
  const cake = product("cake", "bake");
  const water = product("water", "cold", true);
  const products = [coffee, cake, water];
  const cart = [{ key: "1", productId: "coffee", name: "קפה", unitPrice: 10, qty: 1 }];
  const paired = upsellSuggestions(cart, products, [{ id: "r1", productId: "coffee", categoryId: "", suggestIds: ["cake"] }], []);
  assert.deepEqual(paired.map((item) => item.id), ["cake"]);
  const byCategory = upsellSuggestions(cart, products, [{ id: "r2", productId: "", categoryId: "hot", suggestIds: ["water"] }], []);
  assert.deepEqual(byCategory.map((item) => item.id), ["water"]);
  const sale = { voided: false, kind: "sale", lines: [{ productId: "water", qty: 4 }, { productId: "cake", qty: 1 }] } as Sale;
  const popular = upsellSuggestions(cart, products, [], [sale]);
  assert.equal(popular[0]?.id, "water");
  assert.equal(popular.some((item) => item.id === "coffee"), false);
  const anyItem = upsellSuggestions(cart, products, [{ id: "r3", productId: "", categoryId: "", suggestIds: ["cake"] }], []);
  assert.deepEqual(anyItem.map((item) => item.id), ["cake"]);
});

test("attract slides fall back to kiosk product photos", () => {
  const custom = attractImages({ kioskSlides: [{ id: "s", image: "data:image/jpeg;base64,aa", caption: "בוקר" }] }, []);
  assert.equal(custom[0]?.caption, "בוקר");
  const fallback = attractImages({ kioskSlides: [] }, [{ ...product("coffee", "hot"), image: "/pos/espresso.jpg", name: "אספרסו" }]);
  assert.equal(fallback[0]?.caption, "אספרסו");
});
