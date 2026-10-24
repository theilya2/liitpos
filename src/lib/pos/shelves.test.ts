import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { catalogDoc } from "./docs.ts";
import { MAX_IMAGE_CHARS, usableImage } from "./image.ts";
import { mergeRemoteCatalog } from "./merge.ts";
import { expandTopShelf, moveShelfSlot, placeOnShelf, selectTopShelf } from "./shelves.ts";
import { selectSuppliers } from "./suppliers.ts";
import type { Product } from "./types.ts";

function product(id: string, categoryId: string, shelf: Product["shelf"] = "upper"): Product {
  return {
    id,
    name: id,
    price: 10,
    categoryId,
    sku: id,
    favorite: false,
    active: true,
    image: null,
    trackStock: true,
    stock: 1,
    lowStock: 0,
    shelf,
    kiosk: false,
    extras: [],
  };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if ((path.endsWith(".ts") || path.endsWith(".tsx")) && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

describe("top shelf", () => {
  const cola = product("cola", "drinks");
  const water = product("water", "drinks", "off");
  const cake = product("cake", "bakery", "lower");

  it("keeps the older shelf flag until a manager saves an order", () => {
    const shown = expandTopShelf([cola, water, cake], undefined).map((item) => item.id);
    assert.deepEqual(shown, ["cola", "cake"]);
    assert.equal(selectTopShelf(undefined), selectTopShelf(undefined));
    assert.deepEqual(placeOnShelf(undefined, "cola", true), []);
  });

  it("follows product and category slots, and skips a hidden product inside a category", () => {
    const slots = [
      { kind: "category" as const, id: "drinks" },
      { kind: "product" as const, id: "cake" },
    ];
    assert.deepEqual(expandTopShelf([cake, water, cola], slots).map((item) => item.id), ["cola", "cake"]);
    const moved = moveShelfSlot(slots, 1, -1);
    assert.equal(moved[0]?.id, "cake");
    assert.deepEqual(placeOnShelf(slots, "cola", false).map((slot) => slot.id), ["drinks", "cake"]);
  });
});

describe("catalog suppliers and images", () => {
  it("round-trips cost, supplier and a syncable image from a back-office catalog", () => {
    const item = product("bread", "bakery");
    item.name = "לחם";
    item.cost = 2.5;
    item.supplierId = "s1";
    item.image = "data:image/jpeg;base64,abc";
    const doc = catalogDoc(
      {
        id: "biz",
        categories: [{ id: "bakery", name: "מאפה" }],
        products: [item],
        members: [],
        suppliers: [{ id: "s1", name: "מאפייה" }],
        nextReceipt: 1001,
        nextZ: 1,
        nextCredit: 1,
      },
      "2026-01-02T00:00:00.000Z",
    );
    const merged = mergeRemoteCatalog(
      { products: [], categories: [], members: [], suppliers: [], nextReceipt: 1, nextZ: 1, nextCredit: 1 },
      doc,
      [],
    );
    assert.equal(merged.suppliers?.[0]?.name, "מאפייה");
    assert.equal(merged.products[0]?.cost, 2.5);
    assert.equal(merged.products[0]?.supplierId, "s1");
    assert.equal(merged.products[0]?.image, item.image);
    assert.equal(selectSuppliers(undefined), selectSuppliers(undefined));
  });

  it("refuses an image that would be stripped on sync", () => {
    assert.equal(usableImage(`data:image/jpeg;base64,${"a".repeat(MAX_IMAGE_CHARS)}`), null);
    assert.equal(usableImage("data:image/jpeg;base64,abc")?.startsWith("data:image/"), true);
  });
});

function unstableSelectors(text: string): string[] {
  const hits: string[] = [];
  const start = /usePos\(\s*\(/g;
  for (const match of text.matchAll(start)) {
    const arrow = text.indexOf("=>", match.index);
    if (arrow < 0 || arrow - match.index > 80) continue;
    let depth = 0;
    let end = arrow + 2;
    for (; end < text.length && end < arrow + 400; end += 1) {
      const ch = text[end];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        if (depth === 0) break;
        depth -= 1;
      } else if (ch === ";" && depth === 0) break;
    }
    const body = text.slice(arrow + 2, end);
    if (/\?\?\s*(?:\[\]|\{\})/.test(body)) hits.push(body.replace(/\s+/g, " ").trim());
  }
  return hits;
}

describe("zustand selector stability", () => {
  it("does not allocate a fresh array or object inside a store selector", () => {
    const bad: string[] = [];
    for (const file of walk("src")) {
      for (const body of unstableSelectors(readFileSync(file, "utf8"))) bad.push(`${file}: ${body}`);
    }
    assert.deepEqual(bad, []);
  });

  it("still catches the promotion selector that looped the manage page", () => {
    const crashed = `const promos = usePos((state) => state.settings.promos ?? []);`;
    assert.equal(unstableSelectors(crashed).length, 1);
    const fixed = `const promos = usePos((state) => selectPromos(state.settings.promos));`;
    assert.deepEqual(unstableSelectors(fixed), []);
  });
});
