import { computeTotals, roundMoney, type Totals } from "@/lib/pos/money";
import type { CartLine, Discount, Product, Promo, PromoKind } from "@/lib/pos/types";

export type { Promo, PromoKind };

export type PromoHit = { id: string; name: string; amount: number };

const KINDS: PromoKind[] = ["bogo", "bxgy", "bundle", "percent", "amount"];

export function cleanPromos(value: unknown): Promo[] {
  if (!Array.isArray(value)) return [];
  const promos: Promo[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Promo>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
    if (!name || !KINDS.includes(raw.kind as PromoKind)) continue;
    const days = Array.isArray(raw.days) ? raw.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7) : [];
    promos.push({
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : `promo_${promos.length}`,
      name,
      active: raw.active !== false,
      kind: raw.kind as PromoKind,
      stackable: raw.stackable === true,
      productId: typeof raw.productId === "string" ? raw.productId.slice(0, 40) : "",
      categoryId: typeof raw.categoryId === "string" ? raw.categoryId.slice(0, 40) : "",
      rewardProductId: typeof raw.rewardProductId === "string" ? raw.rewardProductId.slice(0, 40) : "",
      buyQty: clampInt(raw.buyQty, 1, 1, 99),
      getQty: clampInt(raw.getQty, 1, 1, 99),
      bundlePrice: moneyOrZero(raw.bundlePrice),
      percent: Math.min(100, moneyOrZero(raw.percent)),
      amount: moneyOrZero(raw.amount),
      days,
      startTime: clock(raw.startTime),
      endTime: clock(raw.endTime),
      startDate: day(raw.startDate),
      endDate: day(raw.endDate),
    });
    if (promos.length >= 40) break;
  }
  return promos;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

function moneyOrZero(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? roundMoney(next) : 0;
}

function clock(value: unknown): string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function day(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

type Unit = { productId: string; categoryId: string; price: number };

function expand(lines: CartLine[], products: Product[]): Unit[] {
  const category = new Map(products.map((product) => [product.id, product.categoryId]));
  const units: Unit[] = [];
  for (const line of lines) {
    const qty = Math.floor(line.qty);
    if (!line.productId || qty <= 0) continue;
    for (let index = 0; index < qty; index += 1) {
      units.push({ productId: line.productId, categoryId: category.get(line.productId) ?? "", price: line.unitPrice });
    }
  }
  return units;
}

function targets(unit: Unit, promo: Promo): boolean {
  if (promo.productId) return unit.productId === promo.productId;
  if (promo.categoryId) return unit.categoryId === promo.categoryId;
  return false;
}

export function promoOpen(promo: Promo, at: Date): boolean {
  if (!promo.active) return false;
  if (promo.days.length && !promo.days.includes(at.getDay())) return false;
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  if (promo.startDate && date < promo.startDate) return false;
  if (promo.endDate && date > promo.endDate) return false;
  if (!promo.startTime || !promo.endTime) return true;
  const minutes = at.getHours() * 60 + at.getMinutes();
  const start = Number(promo.startTime.slice(0, 2)) * 60 + Number(promo.startTime.slice(3));
  const end = Number(promo.endTime.slice(0, 2)) * 60 + Number(promo.endTime.slice(3));
  if (end >= start) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function cheapest(units: Unit[], count: number): number {
  return roundMoney([...units].sort((a, b) => a.price - b.price).slice(0, count).reduce((sum, unit) => sum + unit.price, 0));
}

function onePromo(promo: Promo, units: Unit[]): number {
  if (promo.kind === "percent" || promo.kind === "amount") {
    const gross = roundMoney(units.filter((unit) => targets(unit, promo)).reduce((sum, unit) => sum + unit.price, 0));
    if (gross <= 0) return 0;
    if (promo.kind === "percent") return roundMoney((gross * promo.percent) / 100);
    return roundMoney(Math.min(promo.amount, gross));
  }
  if (promo.kind === "bundle") {
    if (promo.bundlePrice <= 0 || promo.buyQty < 1) return 0;
    const pool = units.filter((unit) => targets(unit, promo)).sort((a, b) => b.price - a.price);
    const sets = Math.floor(pool.length / promo.buyQty);
    let saved = 0;
    for (let index = 0; index < sets; index += 1) {
      const chunk = pool.slice(index * promo.buyQty, (index + 1) * promo.buyQty);
      const sum = chunk.reduce((total, unit) => total + unit.price, 0);
      if (sum > promo.bundlePrice) saved += sum - promo.bundlePrice;
    }
    return roundMoney(saved);
  }
  const buyQty = Math.max(1, promo.kind === "bogo" ? 1 : promo.buyQty);
  const getQty = Math.max(1, promo.kind === "bogo" ? 1 : promo.getQty);
  const buyPool = units.filter((unit) => targets(unit, promo));
  if (promo.rewardProductId && promo.rewardProductId !== promo.productId) {
    const rewards = units.filter((unit) => unit.productId === promo.rewardProductId);
    const free = Math.min(Math.floor(buyPool.length / buyQty) * getQty, rewards.length);
    return cheapest(rewards, free);
  }
  const free = Math.floor(buyPool.length / (buyQty + getQty)) * getQty;
  return cheapest(buyPool, free);
}

export function quotePromos(lines: CartLine[], products: Product[], promos: Promo[] | undefined, at = new Date()): { amount: number; hits: PromoHit[] } {
  const units = expand(lines, products);
  const gross = roundMoney(units.reduce((sum, unit) => sum + unit.price, 0));
  const offers = (promos ?? [])
    .filter((promo) => promoOpen(promo, at))
    .map((promo) => ({ promo, amount: onePromo(promo, units) }))
    .filter((offer) => offer.amount > 0);
  const exclusive = offers.filter((offer) => !offer.promo.stackable).sort((a, b) => b.amount - a.amount)[0];
  const stackHits: PromoHit[] = [];
  let stacked = 0;
  for (const offer of offers.filter((item) => item.promo.stackable).sort((a, b) => b.amount - a.amount)) {
    const room = roundMoney(gross - stacked);
    if (room <= 0) break;
    const amount = roundMoney(Math.min(offer.amount, room));
    stacked = roundMoney(stacked + amount);
    stackHits.push({ id: offer.promo.id, name: offer.promo.name, amount });
  }
  if (exclusive && exclusive.amount >= stacked) {
    return { amount: roundMoney(Math.min(exclusive.amount, gross)), hits: [{ id: exclusive.promo.id, name: exclusive.promo.name, amount: roundMoney(Math.min(exclusive.amount, gross)) }] };
  }
  return { amount: stacked, hits: stackHits };
}

export type PricedCart = Totals & { promoAmount: number; promoLabel: string; hits: PromoHit[] };

export function priceCart(lines: CartLine[], products: Product[], promos: Promo[] | undefined, discount: Discount, vatRate: number, at = new Date()): PricedCart {
  const gross = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.unitPrice * line.qty), 0));
  const quote = quotePromos(lines, products, promos, at);
  const promoAmount = roundMoney(Math.min(quote.amount, gross));
  const left = roundMoney(gross - promoAmount);
  let manual = 0;
  if (discount && discount.value > 0 && left > 0) {
    manual = discount.kind === "percent" ? roundMoney((left * discount.value) / 100) : roundMoney(Math.min(discount.value, left));
  }
  const total = roundMoney(Math.max(0, left - manual));
  const rate = Number.isFinite(vatRate) ? vatRate : 0;
  const vat = roundMoney((total * rate) / (100 + rate));
  return {
    gross,
    discountAmount: manual,
    promoAmount,
    promoLabel: quote.hits.map((hit) => hit.name).join(" · "),
    hits: quote.hits,
    total,
    vat,
    net: roundMoney(total - vat),
  };
}

/** Same numbers as before when nothing is on promotion. */
export function pricedOrPlain(lines: CartLine[], products: Product[], promos: Promo[] | undefined, discount: Discount, vatRate: number): PricedCart {
  if (!promos?.length) {
    const totals = computeTotals(lines, discount, vatRate);
    return { ...totals, promoAmount: 0, promoLabel: "", hits: [] };
  }
  return priceCart(lines, products, promos, discount, vatRate);
}
