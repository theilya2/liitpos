import type { Product, ShelfRef } from "@/lib/pos/types";

/** Stable empty list for zustand selectors. */
export const EMPTY_SHELF: ShelfRef[] = [];

export function selectTopShelf(shelf: ShelfRef[] | undefined): ShelfRef[] {
  return shelf ?? EMPTY_SHELF;
}

export function cleanTopShelf(value: unknown): ShelfRef[] {
  if (!Array.isArray(value)) return [];
  const slots: ShelfRef[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<ShelfRef>;
    if (raw.kind !== "product" && raw.kind !== "category") continue;
    if (typeof raw.id !== "string" || !raw.id) continue;
    const id = raw.id.slice(0, 40);
    const key = `${raw.kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ kind: raw.kind, id });
    if (slots.length >= 48) break;
  }
  return slots;
}

function matchesQuery(product: Product, query: string): boolean {
  if (!query) return true;
  return (
    product.name.includes(query) ||
    product.sku.includes(query) ||
    (product.barcode ?? "").includes(query) ||
    (product.variants ?? []).some((variant) => variant.sku.includes(query) || variant.barcode.includes(query))
  );
}

/** Products for the top shelf, in the manager's order. An empty layout keeps the older per-product shelf flag. */
export function expandTopShelf(products: Product[], slots: ShelfRef[] | undefined, query = ""): Product[] {
  const q = query.trim();
  const active = products.filter((product) => product.active);
  if (!slots?.length) {
    return active
      .filter((product) => product.shelf !== "off" && matchesQuery(product, q))
      .sort((a, b) => Number(a.shelf !== "upper") - Number(b.shelf !== "upper"));
  }
  const byId = new Map(active.map((product) => [product.id, product]));
  const seen = new Set<string>();
  const result: Product[] = [];
  for (const slot of slots) {
    const group =
      slot.kind === "product"
        ? [byId.get(slot.id)].filter((product): product is Product => Boolean(product))
        : active.filter((product) => product.categoryId === slot.id);
    for (const product of group) {
      if (seen.has(product.id) || !matchesQuery(product, q)) continue;
      if (slot.kind === "category" && product.shelf === "off") continue;
      seen.add(product.id);
      result.push(product);
    }
  }
  return result;
}

/** Move a product into or out of an existing layout. An empty layout stays empty so the shelf flag still decides. */
export function placeOnShelf(slots: ShelfRef[] | undefined, productId: string, onShelf: boolean): ShelfRef[] {
  const current = cleanTopShelf(slots).filter((slot) => !(slot.kind === "product" && slot.id === productId));
  if (!slots?.length || !onShelf) return current;
  return [...current, { kind: "product", id: productId }];
}

export function seedTopShelf(products: Product[]): ShelfRef[] {
  return products.filter((product) => product.active && product.shelf !== "off").map((product) => ({ kind: "product" as const, id: product.id }));
}

export function moveShelfSlot(slots: ShelfRef[], index: number, direction: -1 | 1): ShelfRef[] {
  const next = index + direction;
  if (index < 0 || next < 0 || index >= slots.length || next >= slots.length) return slots;
  const copy = slots.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}
