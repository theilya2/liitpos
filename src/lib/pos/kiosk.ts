import type { CartLine, KioskSlide, Product, Sale, Settings, UpsellRule } from "@/lib/pos/types";

export function kioskTiming(settings: Pick<Settings, "kioskIdleSec" | "kioskWarnSec" | "kioskLock">): { idle: number; warn: number; lock: boolean } {
  const idle = clamp(settings.kioskIdleSec, 60, 15, 600);
  const warn = clamp(settings.kioskWarnSec, 15, 5, 90);
  return { idle, warn, lock: settings.kioskLock === true };
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next)));
}

export function normalizeKioskSettings(raw: object | null | undefined): Pick<Settings, "kioskIdleSec" | "kioskWarnSec" | "kioskLock" | "kioskSlides" | "upsellRules"> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const timing = kioskTiming({
    kioskIdleSec: numberOrUndefined(source.kioskIdleSec),
    kioskWarnSec: numberOrUndefined(source.kioskWarnSec),
    kioskLock: source.kioskLock === true,
  });
  return {
    kioskIdleSec: timing.idle,
    kioskWarnSec: timing.warn,
    kioskLock: timing.lock,
    kioskSlides: slidesOf(source.kioskSlides),
    upsellRules: rulesOf(source.upsellRules),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function slidesOf(value: unknown): KioskSlide[] {
  if (!Array.isArray(value)) return [];
  const slides: KioskSlide[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<KioskSlide>;
    const image = typeof raw.image === "string" && raw.image.startsWith("data:image/") && raw.image.length <= 150_000 ? raw.image : "";
    if (!image) continue;
    slides.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `slide-${slides.length}`,
      image,
      caption: typeof raw.caption === "string" ? raw.caption.slice(0, 80) : "",
    });
    if (slides.length >= 8) break;
  }
  return slides;
}

function rulesOf(value: unknown): UpsellRule[] {
  if (!Array.isArray(value)) return [];
  const rules: UpsellRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<UpsellRule>;
    const suggestIds = Array.isArray(raw.suggestIds) ? raw.suggestIds.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 6) : [];
    if (!suggestIds.length) continue;
    rules.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `up-${rules.length}`,
      productId: typeof raw.productId === "string" ? raw.productId.slice(0, 40) : "",
      categoryId: typeof raw.categoryId === "string" ? raw.categoryId.slice(0, 40) : "",
      suggestIds,
    });
    if (rules.length >= 40) break;
  }
  return rules;
}

export function attractImages(settings: Pick<Settings, "kioskSlides">, products: Product[]): { image: string; caption: string }[] {
  const slides = (settings.kioskSlides ?? []).filter((slide) => slide.image);
  if (slides.length) return slides.map((slide) => ({ image: slide.image, caption: slide.caption }));
  return products
    .filter((product) => product.active && product.kiosk && product.image)
    .slice(0, 8)
    .map((product) => ({ image: product.image ?? "", caption: product.name }));
}

/** Pairings first. If none match, the products that sold the most, then favorites. */
export function upsellSuggestions(cart: CartLine[], products: Product[], rules: UpsellRule[] | undefined, sales: Sale[]): Product[] {
  const inCart = new Set(cart.map((line) => line.productId).filter((id): id is string => Boolean(id)));
  const byId = new Map(products.filter((product) => product.active).map((product) => [product.id, product]));
  const picked: Product[] = [];
  const seen = new Set<string>();
  function push(id: string) {
    if (inCart.has(id) || seen.has(id)) return;
    const product = byId.get(id);
    if (!product) return;
    seen.add(id);
    picked.push(product);
  }
  for (const line of cart) {
    const product = line.productId ? byId.get(line.productId) : undefined;
    for (const rule of rules ?? []) {
      if (rule.productId && rule.productId !== line.productId) continue;
      if (rule.categoryId && (!product || rule.categoryId !== product.categoryId)) continue;
      for (const id of rule.suggestIds) push(id);
    }
  }
  if (picked.length) return picked.slice(0, 4);
  const counts = new Map<string, number>();
  for (const sale of sales) {
    if (sale.voided || sale.kind === "credit") continue;
    for (const line of sale.lines) {
      if (!line.productId) continue;
      counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.qty);
    }
  }
  const ranked = [...byId.values()].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || Number(b.favorite) - Number(a.favorite));
  for (const product of ranked) push(product.id);
  return picked.slice(0, 4);
}
