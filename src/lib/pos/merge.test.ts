import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CloudDoc } from "./docs.ts";
import { mergeRemoteCatalog, reconcilePush } from "./merge.ts";
import type { Product } from "./types.ts";

function product(id: string, name: string, stock: number, updatedAt?: string): Product {
  return {
    id,
    name,
    price: 10,
    categoryId: "hot",
    sku: "",
    favorite: false,
    active: true,
    image: null,
    trackStock: true,
    stock,
    lowStock: 1,
    shelf: "off",
    kiosk: false,
    extras: [],
    updatedAt,
  };
}

function catalog(businessId: string, products: Product[], updatedAt: string): CloudDoc {
  return {
    id: `catalog:${businessId}`,
    kind: "catalog",
    businessId,
    updatedAt,
    deleted: false,
    doc: { products, categories: [{ id: "hot", name: "חם" }], members: [], nextReceipt: 1001, nextZ: 1 },
  };
}

function sale(id: string, updatedAt: string, voided = false): CloudDoc {
  return {
    id: `sale:store:${id}`,
    kind: "sale",
    businessId: "store",
    updatedAt,
    deleted: false,
    doc: { id, voided, total: 10 },
  };
}

function move(id: string, productId: string, qty: number, updatedAt: string): CloudDoc {
  return {
    id: `move:store:${id}`,
    kind: "move",
    businessId: "store",
    updatedAt,
    deleted: false,
    doc: { id, productId, qty, productName: "א", at: updatedAt, stockAfter: 0, reason: "sale", note: "", by: "" },
  };
}

describe("reconcilePush", () => {
  it("keeps sales from two registers and ignores a second push of the same sale", () => {
    const first = reconcilePush([], [sale("a", "2026-01-01T00:00:00.000Z"), sale("b", "2026-01-01T00:00:01.000Z")]);
    assert.deepEqual(first.accepted.sort(), ["sale:store:a", "sale:store:b"]);
    const again = reconcilePush(first.upserts, [sale("a", "2026-01-01T00:00:00.000Z")]);
    assert.equal(again.upserts.some((doc) => doc.id === "sale:store:a" && doc.kind === "sale"), false);
    assert.ok(again.skipped.includes("sale:store:a"));
  });

  it("lets a newer void replace the sale without dropping the other device's sale", () => {
    const stored = [sale("a", "2026-01-01T00:00:00.000Z"), sale("b", "2026-01-01T00:00:01.000Z")];
    const next = reconcilePush(stored, [sale("a", "2026-01-02T00:00:00.000Z", true)]);
    const saved = next.upserts.find((doc) => doc.id === "sale:store:a");
    assert.equal((saved?.doc as { voided?: boolean }).voided, true);
    assert.equal(next.upserts.some((doc) => doc.id === "sale:store:b"), false);
  });

  it("merges product edits and applies a stock move once", () => {
    const base = catalog("store", [product("p1", "קפה", 10, "2026-01-01T00:00:00.000Z")], "2026-01-01T00:00:00.000Z");
    const edited = catalog("store", [product("p1", "קפה גדול", 10, "2026-01-02T00:00:00.000Z"), product("p2", "עוגה", 4, "2026-01-02T00:00:00.000Z")], "2026-01-02T00:00:00.000Z");
    const merged = reconcilePush([base], [edited, move("m1", "p1", -1, "2026-01-02T00:00:01.000Z")]);
    const saved = merged.upserts.find((doc) => doc.kind === "catalog");
    const products = (saved?.doc as { products: Product[] }).products;
    assert.equal(products.find((item) => item.id === "p1")?.name, "קפה גדול");
    assert.equal(products.find((item) => item.id === "p1")?.stock, 9);
    assert.equal(products.find((item) => item.id === "p2")?.stock, 4);
    const retry = reconcilePush([saved!, ...merged.upserts.filter((doc) => doc.kind === "move")], [move("m1", "p1", -1, "2026-01-02T00:00:01.000Z")]);
    assert.ok(retry.skipped.includes("move:store:m1"));
    assert.equal(retry.upserts.some((doc) => doc.kind === "catalog"), false);
  });

  it("does not apply the creating register's moves twice onto a new product", () => {
    const created = catalog("store", [product("p9", "חדש", 9, "2026-01-03T00:00:00.000Z")], "2026-01-03T00:00:00.000Z");
    const result = reconcilePush([], [created, move("m9", "p9", -1, "2026-01-03T00:00:01.000Z")]);
    const saved = result.upserts.find((doc) => doc.kind === "catalog");
    const products = (saved?.doc as { products: Product[] }).products;
    assert.equal(products[0]?.stock, 9);
    assert.ok(result.accepted.includes("move:store:m9"));
  });
});

describe("mergeRemoteCatalog", () => {
  it("keeps local stock while a move is still queued and unions products", () => {
    const local = {
      products: [product("p1", "קפה", 8, "2026-01-01T00:00:00.000Z")],
      categories: [{ id: "hot", name: "חם" }],
      members: [],
      nextReceipt: 1005,
      nextZ: 1,
    };
    const remote = catalog("store", [product("p1", "קפה", 10, "2026-01-02T00:00:00.000Z"), product("p2", "תה", 3, "2026-01-02T00:00:00.000Z")], "2026-01-02T00:00:00.000Z");
    const merged = mergeRemoteCatalog(local, remote, [{ productId: "p1", qty: -2 }]);
    assert.equal(merged.products.find((item) => item.id === "p1")?.stock, 8);
    assert.equal(merged.products.find((item) => item.id === "p1")?.name, "קפה");
    assert.equal(merged.products.find((item) => item.id === "p2")?.name, "תה");
    assert.equal(merged.nextReceipt, 1005);
  });
});
