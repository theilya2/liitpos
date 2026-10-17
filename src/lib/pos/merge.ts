import type { CloudDoc } from "@/lib/pos/docs";
import type { Category, ClubMember, Product, StockMove } from "@/lib/pos/types";

/**
 * How two registers combine work.
 *
 * Sales, stock moves, Z reports and drawer opens are append-only. Each one has
 * its own id, so two devices can sell offline and both records survive. Pushing
 * the same id again is a no-op (or, for a sale, a newer edit such as a void).
 *
 * Settings and staff are last-write-wins per record, compared by `updatedAt`.
 *
 * The catalog (products, categories, members) is merged per id. A product edit
 * on one register does not wipe a different product edited on another.
 * Stock is not taken from the catalog snapshot of an existing product: each
 * stock change is a move, applied once. A brand-new product keeps the stock it
 * was created with, and the moves that happened before its first sync are
 * stored but not applied a second time.
 */

const APPEND_KINDS = new Set<CloudDoc["kind"]>(["move", "z", "drawer"]);

type CatalogShape = {
  products: Product[];
  categories: Category[];
  members: ClubMember[];
  nextReceipt: number;
  nextZ: number;
};

export type ReconcileResult = {
  upserts: CloudDoc[];
  accepted: string[];
  skipped: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stamp(value: string | undefined): string {
  return value && Number.isFinite(Date.parse(value)) ? value : "";
}

function later(a: string | undefined, b: string | undefined): boolean {
  return stamp(a) >= stamp(b);
}

function maxStamp(a: string, b: string): string {
  return later(a, b) ? a : b;
}

function asMove(doc: CloudDoc): StockMove | null {
  if (doc.kind !== "move" || !isRecord(doc.doc) || typeof doc.doc.id !== "string") return null;
  const qty = Number(doc.doc.qty);
  if (!Number.isFinite(qty) || typeof doc.doc.productId !== "string") return null;
  return doc.doc as StockMove;
}

function productList(doc: CloudDoc | null): Product[] {
  if (!doc || !isRecord(doc.doc) || !Array.isArray(doc.doc.products)) return [];
  return doc.doc.products.filter((item): item is Product => isRecord(item) && typeof item.id === "string" && typeof item.name === "string");
}

function categoryList(doc: CloudDoc | null): Category[] {
  if (!doc || !isRecord(doc.doc) || !Array.isArray(doc.doc.categories)) return [];
  return doc.doc.categories.filter((item): item is Category => isRecord(item) && typeof item.id === "string" && typeof item.name === "string");
}

function memberList(doc: CloudDoc | null): ClubMember[] {
  if (!doc || !isRecord(doc.doc) || !Array.isArray(doc.doc.members)) return [];
  return doc.doc.members.filter((item): item is ClubMember => isRecord(item) && typeof item.id === "string");
}

function nextNumber(doc: CloudDoc | null, key: "nextReceipt" | "nextZ", fallback: number): number {
  if (!doc || !isRecord(doc.doc)) return fallback;
  const value = Number(doc.doc[key]);
  return Number.isFinite(value) ? value : fallback;
}

function unionById<T extends { id: string }>(local: T[], remote: T[], pick: (localItem: T, remoteItem: T) => T): T[] {
  const map = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const prev = map.get(item.id);
    map.set(item.id, prev ? pick(prev, item) : item);
  }
  return [...map.values()];
}

export function mergeCatalogDocs(existing: CloudDoc | null, incoming: CloudDoc): { doc: CloudDoc; newProductIds: string[] } {
  const existingProducts = productList(existing);
  const incomingProducts = productList(incoming);
  const known = new Set(existingProducts.map((product) => product.id));
  const newProductIds = incomingProducts.filter((product) => !known.has(product.id)).map((product) => product.id);
  const products = unionById(existingProducts, incomingProducts, (prev, next) => {
    const nextWins = later(next.updatedAt, prev.updatedAt);
    const chosen = nextWins ? next : prev;
    return { ...chosen, stock: prev.stock };
  });
  const remoteCatalogWins = !existing || later(incoming.updatedAt, existing.updatedAt);
  const categories = unionById(categoryList(existing), categoryList(incoming), (prev, next) => (remoteCatalogWins ? next : prev));
  const members = unionById(memberList(existing), memberList(incoming), (prev, next) => {
    const prevAt = prev.updatedAt ?? (remoteCatalogWins ? "" : existing?.updatedAt);
    const nextAt = next.updatedAt ?? (remoteCatalogWins ? incoming.updatedAt : "");
    return later(nextAt, prevAt) ? next : prev;
  });
  const updatedAt = existing ? maxStamp(existing.updatedAt, incoming.updatedAt) : incoming.updatedAt;
  return {
    newProductIds,
    doc: {
      id: incoming.id,
      kind: "catalog",
      businessId: incoming.businessId,
      updatedAt,
      deleted: false,
      doc: {
        products,
        categories,
        members,
        nextReceipt: Math.max(nextNumber(existing, "nextReceipt", 1001), nextNumber(incoming, "nextReceipt", 1001)),
        nextZ: Math.max(nextNumber(existing, "nextZ", 1), nextNumber(incoming, "nextZ", 1)),
      },
    },
  };
}

function withStock(catalog: CloudDoc, productId: string, qty: number): CloudDoc {
  if (!isRecord(catalog.doc) || !Array.isArray(catalog.doc.products)) return catalog;
  const products = catalog.doc.products.map((item) => {
    if (!isRecord(item) || item.id !== productId || item.trackStock === false) return item;
    const stock = Number(item.stock);
    const next = Math.round(((Number.isFinite(stock) ? stock : 0) + qty) * 100) / 100;
    return { ...item, stock: Math.max(0, next) };
  });
  return { ...catalog, doc: { ...catalog.doc, products } };
}

function sameDoc(a: CloudDoc, b: CloudDoc): boolean {
  return a.updatedAt === b.updatedAt && JSON.stringify(a.doc) === JSON.stringify(b.doc) && a.deleted === b.deleted;
}

export function reconcilePush(existing: CloudDoc[], incoming: CloudDoc[]): ReconcileResult {
  const byId = new Map(existing.map((doc) => [doc.id, doc]));
  const accepted: string[] = [];
  const skipped: string[] = [];
  const upserts: CloudDoc[] = [];
  const newProductIds = new Set<string>();
  const catalogs = new Map<string, CloudDoc>();

  const ordered = [...incoming].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
  const catalogsIn = ordered.filter((doc) => doc.kind === "catalog" && !doc.deleted);
  const rest = ordered.filter((doc) => doc.kind !== "catalog");

  for (const doc of catalogsIn) {
    const { doc: merged, newProductIds: created } = mergeCatalogDocs(byId.get(doc.id) ?? catalogs.get(doc.id) ?? null, doc);
    for (const id of created) newProductIds.add(`${doc.businessId}:${id}`);
    catalogs.set(merged.id, merged);
    byId.set(merged.id, merged);
  }

  const freshMoves: CloudDoc[] = [];
  for (const doc of rest) {
    const prev = byId.get(doc.id);
    if (APPEND_KINDS.has(doc.kind)) {
      if (prev) {
        skipped.push(doc.id);
        continue;
      }
      byId.set(doc.id, doc);
      upserts.push(doc);
      accepted.push(doc.id);
      if (doc.kind === "move") freshMoves.push(doc);
      continue;
    }
    if (prev && !later(doc.updatedAt, prev.updatedAt)) {
      skipped.push(doc.id);
      continue;
    }
    if (prev && sameDoc(prev, doc)) {
      skipped.push(doc.id);
      continue;
    }
    byId.set(doc.id, doc);
    upserts.push(doc);
    accepted.push(doc.id);
  }

  for (const moveDoc of freshMoves) {
    const move = asMove(moveDoc);
    if (!move || newProductIds.has(`${moveDoc.businessId}:${move.productId}`)) continue;
    const catalogId = `catalog:${moveDoc.businessId}`;
    const catalog = catalogs.get(catalogId) ?? byId.get(catalogId);
    if (!catalog) continue;
    const next = withStock(catalog, move.productId, move.qty);
    catalogs.set(catalogId, next);
    byId.set(catalogId, next);
  }

  for (const catalog of catalogs.values()) {
    const prev = existing.find((doc) => doc.id === catalog.id) ?? null;
    if (prev && sameDoc(prev, catalog)) {
      const incomingCatalog = catalogsIn.find((doc) => doc.id === catalog.id);
      if (incomingCatalog) skipped.push(incomingCatalog.id);
      continue;
    }
    upserts.push(catalog);
    if (catalogsIn.some((doc) => doc.id === catalog.id)) accepted.push(catalog.id);
  }

  return { upserts, accepted, skipped };
}

export function mergeRemoteCatalog(
  local: CatalogShape,
  remote: CloudDoc,
  pendingMoves: { productId: string; qty: number }[],
): CatalogShape {
  const remoteProducts = productList(remote);
  const pendingIds = new Set(pendingMoves.map((move) => move.productId));
  const products = unionById(local.products, remoteProducts, (prev, next) => {
    const chosen = later(next.updatedAt, prev.updatedAt) ? next : prev;
    return { ...chosen, stock: pendingIds.has(prev.id) ? prev.stock : next.stock };
  });
  const categories = unionById(local.categories, categoryList(remote), (_prev, next) => next);
  const members = unionById(local.members, memberList(remote), (prev, next) => (later(next.updatedAt, prev.updatedAt) ? next : prev));
  return {
    products,
    categories,
    members,
    nextReceipt: Math.max(local.nextReceipt, nextNumber(remote, "nextReceipt", local.nextReceipt)),
    nextZ: Math.max(local.nextZ, nextNumber(remote, "nextZ", local.nextZ)),
  };
}
