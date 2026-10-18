import { roundMoney } from "@/lib/pos/money";
import type { CartLine, ChosenModifier, ModifierGroup, Product, ProductVariant, Sale } from "@/lib/pos/types";

export function cleanVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  const variants: ProductVariant[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<ProductVariant>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
    const price = Number(raw.price);
    if (!name || !Number.isFinite(price) || price < 0) continue;
    const stock = Number(raw.stock);
    variants.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `v_${variants.length}`,
      name,
      price: roundMoney(price),
      sku: typeof raw.sku === "string" ? raw.sku.trim().slice(0, 32) : "",
      barcode: typeof raw.barcode === "string" ? raw.barcode.trim().slice(0, 32) : "",
      stock: Number.isFinite(stock) ? Math.max(0, roundMoney(stock)) : 0,
      active: raw.active !== false,
    });
    if (variants.length >= 12) break;
  }
  return variants;
}

export function cleanGroups(value: unknown): ModifierGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: ModifierGroup[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<ModifierGroup>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
    const options = cleanOptions(raw.options);
    if (!name || !options.length) continue;
    let max = Math.round(Number(raw.max));
    if (!Number.isFinite(max)) max = 1;
    max = Math.min(options.length, Math.max(1, max));
    let min = Math.round(Number(raw.min));
    if (!Number.isFinite(min)) min = 0;
    const required = raw.required === true || min >= 1;
    if (required) min = Math.max(1, min);
    min = Math.min(max, Math.max(0, min));
    groups.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `g_${groups.length}`,
      name,
      required,
      min,
      max,
      options,
    });
    if (groups.length >= 6) break;
  }
  return groups;
}

function cleanOptions(value: unknown): ModifierGroup["options"] {
  if (!Array.isArray(value)) return [];
  const options: ModifierGroup["options"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { id?: string; name?: string; price?: number };
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
    const price = Number(raw.price);
    if (!name || !Number.isFinite(price) || price < 0) continue;
    options.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `o_${options.length}`,
      name,
      price: roundMoney(price),
    });
    if (options.length >= 12) break;
  }
  return options;
}

export function activeVariants(product: Product): ProductVariant[] {
  return (product.variants ?? []).filter((variant) => variant.active);
}

/** Saved groups win. Older extras stay one optional group so the kiosk still offers them. */
export function groupsFor(product: Product): ModifierGroup[] {
  const saved = cleanGroups(product.modifierGroups);
  if (saved.length) return saved;
  if (!product.extras?.length) return [];
  return [
    {
      id: "legacy-extras",
      name: "תוספות",
      required: false,
      min: 0,
      max: product.extras.length,
      options: product.extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price })),
    },
  ];
}

export function needsPicker(product: Product): boolean {
  return activeVariants(product).length > 0 || groupsFor(product).some((group) => group.options.length > 0);
}

export function mustChoose(product: Product): boolean {
  return groupsFor(product).some((group) => group.required || group.min > 0);
}

export function shelfPrice(product: Product): { amount: number; from: boolean } {
  const variants = activeVariants(product);
  if (!variants.length) return { amount: product.price, from: false };
  const amount = Math.min(...variants.map((variant) => variant.price));
  return { amount, from: variants.some((variant) => variant.price !== amount) };
}

export function ruleLabel(group: ModifierGroup): string {
  if (group.min === 1 && group.max === 1) return "בחרו אחד";
  if (group.min === 0 && group.max >= group.options.length) return "לא חובה";
  if (group.min === 0) return `עד ${group.max}`;
  if (group.min === group.max) return `בחרו ${group.min}`;
  return `בין ${group.min} ל-${group.max}`;
}

export function buildConfiguredLine(input: {
  product: Product;
  variantId?: string | null;
  picks: { groupId: string; optionId: string }[];
  qty: number;
  key?: string;
}): CartLine | null {
  const variants = activeVariants(input.product);
  const variant = input.variantId ? (variants.find((item) => item.id === input.variantId) ?? null) : null;
  if (variants.length && !variant) return null;
  const modifiers: ChosenModifier[] = [];
  for (const group of groupsFor(input.product)) {
    const ids = [...new Set(input.picks.filter((pick) => pick.groupId === group.id).map((pick) => pick.optionId))];
    if (ids.length < group.min || ids.length > group.max) return null;
    for (const id of ids) {
      const option = group.options.find((item) => item.id === id);
      if (!option) return null;
      modifiers.push({ groupId: group.id, optionId: option.id, name: option.name, price: option.price });
    }
  }
  const qty = Math.max(1, Math.round(input.qty));
  const base = variant ? variant.price : input.product.price;
  const parts = [input.product.name];
  if (variant) parts.push(variant.name);
  for (const modifier of modifiers) parts.push(modifier.name);
  return {
    key: input.key ?? "line",
    productId: input.product.id,
    variantId: variant?.id ?? null,
    sku: variant?.sku || input.product.sku,
    name: parts.join(" · ").slice(0, 80),
    unitPrice: roundMoney(base + modifiers.reduce((sum, modifier) => sum + modifier.price, 0)),
    qty,
    modifiers,
  };
}

export function findByCode(products: Product[], code: string): { product: Product; variant: ProductVariant | null } | null {
  const query = code.trim();
  if (!query) return null;
  for (const product of products) {
    if (!product.active) continue;
    for (const variant of product.variants ?? []) {
      if (!variant.active) continue;
      if (variant.sku === query || variant.barcode === query) return { product, variant };
    }
  }
  for (const product of products) {
    if (!product.active) continue;
    if (product.sku === query || product.barcode === query) return { product, variant: null };
  }
  return null;
}

export function stockKey(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

export function splitStockKey(key: string): { productId: string; variantId: string | null } {
  const cut = key.indexOf(":");
  if (cut < 0) return { productId: key, variantId: null };
  return { productId: key.slice(0, cut), variantId: key.slice(cut + 1) || null };
}

export function demandOf(lines: { productId: string | null; variantId?: string | null; qty: number }[]): Map<string, number> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    if (!line.productId) continue;
    const key = stockKey(line.productId, line.variantId);
    needed.set(key, roundMoney((needed.get(key) ?? 0) + line.qty));
  }
  return needed;
}

export function stockOnHand(product: Product, variantId?: string | null): number {
  if (variantId) return product.variants?.find((variant) => variant.id === variantId)?.stock ?? 0;
  return product.stock;
}

export function hasEnough(product: Product | undefined, variantId: string | null | undefined, qty: number): boolean {
  if (!product?.trackStock) return true;
  if (!variantId && activeVariants(product).length) return false;
  return stockOnHand(product, variantId) + 0.0001 >= qty;
}

export function changeStock(
  product: Product,
  variantId: string | null | undefined,
  delta: number,
): { product: Product; stockAfter: number; name: string } {
  if (variantId && product.variants?.some((variant) => variant.id === variantId)) {
    let stockAfter = 0;
    let variantName = "";
    const variants = product.variants.map((variant) => {
      if (variant.id !== variantId) return variant;
      stockAfter = roundMoney(Math.max(0, variant.stock + delta));
      variantName = variant.name;
      return { ...variant, stock: stockAfter };
    });
    return { product: { ...product, variants }, stockAfter, name: `${product.name} · ${variantName}` };
  }
  const stockAfter = roundMoney(Math.max(0, product.stock + delta));
  return { product: { ...product, stock: stockAfter }, stockAfter, name: product.name };
}

export type StockRow = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  stock: number;
  price: number;
  lowStock: number;
  image: string | null;
};

export function stockRows(products: Product[]): StockRow[] {
  const rows: StockRow[] = [];
  for (const product of products) {
    if (!product.trackStock || !product.active) continue;
    const variants = activeVariants(product);
    if (!variants.length) {
      rows.push({
        key: product.id,
        productId: product.id,
        variantId: null,
        name: product.name,
        sku: product.barcode || product.sku,
        stock: product.stock,
        price: product.price,
        lowStock: product.lowStock,
        image: product.image,
      });
      continue;
    }
    for (const variant of variants) {
      rows.push({
        key: `${product.id}:${variant.id}`,
        productId: product.id,
        variantId: variant.id,
        name: `${product.name} · ${variant.name}`,
        sku: variant.barcode || variant.sku || product.sku,
        stock: variant.stock,
        price: variant.price,
        lowStock: product.lowStock,
        image: product.image,
      });
    }
  }
  return rows;
}

export function soldItems(sales: Sale[]): { key: string; name: string; qty: number; total: number }[] {
  const rows = new Map<string, { key: string; name: string; qty: number; total: number }>();
  for (const sale of sales) {
    if (sale.voided) continue;
    const sign = sale.kind === "credit" ? -1 : 1;
    for (const line of sale.lines) {
      const key = `${line.productId ?? "custom"}|${line.variantId ?? ""}|${line.name}`;
      const current = rows.get(key) ?? { key, name: line.name, qty: 0, total: 0 };
      current.qty = roundMoney(current.qty + sign * line.qty);
      current.total = roundMoney(current.total + sign * line.lineTotal);
      rows.set(key, current);
    }
  }
  return [...rows.values()].filter((row) => row.qty !== 0 || row.total !== 0).sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));
}
