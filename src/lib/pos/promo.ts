import { computeTotals, roundMoney, type Totals } from "@/lib/pos/money";
import type { CartLine, Discount, Product, Promo, PromoKind } from "@/lib/pos/types";

export type { Promo, PromoKind };

export type PromoHit = { id: string; name: string; amount: number };

/** Stable empty list for zustand selectors. A fresh `[]` retriggers React forever. */
export const EMPTY_PROMOS: Promo[] = [];

export function selectPromos(promos: Promo[] | undefined): Promo[] {
  return promos ?? EMPTY_PROMOS;
}

const KINDS: PromoKind[] = ["bogo", "bxgy", "bundle", "percent", "amount", "nth", "combo", "threshold"];

export function cleanPromos(value: unknown): Promo[] {
  if (!Array.isArray(value)) return [];
  const promos: Promo[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Promo>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
    if (!name || !KINDS.includes(raw.kind as PromoKind)) continue;
    const days = Array.isArray(raw.days) ? raw.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7) : [];
    const productIds = Array.isArray(raw.productIds)
      ? raw.productIds.filter((id): id is string => typeof id === "string" && id.length > 0).map((id) => id.slice(0, 40)).slice(0, 12)
      : [];
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
      rewardPercent: clampPercent(raw.rewardPercent),
      productIds,
      minSpend: moneyOrZero(raw.minSpend),
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

function clampPercent(value: unknown): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return 100;
  return Math.min(100, Math.max(0, roundMoney(next)));
}

function clock(value: unknown): string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

function day(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function trimNumber(value: number): string {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

const ORDINALS = ["", "", "השני", "השלישי", "הרביעי", "החמישי", "השישי", "השביעי", "השמיני", "התשיעי", "העשירי"];

/** Short label for a promotion card, such as "3 ב-10" or "השני ב-50%". */
export function promoHeadline(promo: Promo): string {
  if (promo.kind === "bogo") return "1+1";
  if (promo.kind === "bundle") return `${Math.max(1, promo.buyQty)} ב-${trimNumber(promo.bundlePrice)}`;
  if (promo.kind === "nth") {
    const n = Math.max(2, promo.buyQty);
    const word = ORDINALS[n] ?? `פריט ${n}`;
    return `${word} ב-${trimNumber(promo.percent)}%`;
  }
  if (promo.kind === "bxgy") {
    const free = !(promo.rewardPercent > 0) || promo.rewardPercent >= 100;
    if (free) return `קנה ${Math.max(1, promo.buyQty)} קבל ${Math.max(1, promo.getQty)}`;
    return `קנה ${Math.max(1, promo.buyQty)} קבל ${Math.max(1, promo.getQty)} ב-${trimNumber(promo.rewardPercent)}%`;
  }
  if (promo.kind === "percent") return `${trimNumber(promo.percent)}%`;
  if (promo.kind === "amount") return `₪${trimNumber(promo.amount)}`;
  if (promo.kind === "combo") return `קומבו ${trimNumber(promo.bundlePrice)}`;
  if (promo.percent > 0) return `מ-${trimNumber(promo.minSpend)} ₪ ${trimNumber(promo.percent)}%`;
  return `מ-${trimNumber(promo.minSpend)} ₪ הנחה ${trimNumber(promo.amount)}`;
}

export type PromoPlan =
  | { mode: "info"; detail: string }
  | { mode: "choose"; categoryId: string; qty: number; extra: { productId: string; qty: number }[] }
  | { mode: "set"; items: { productId: string; qty: number }[] };

function dealQty(promo: Promo): number {
  if (promo.kind === "bogo") return 2;
  if (promo.kind === "bundle" || promo.kind === "nth") return Math.max(1, promo.buyQty);
  if (promo.kind === "bxgy") {
    const rewardElsewhere = promo.rewardProductId && promo.rewardProductId !== promo.productId;
    return Math.max(1, promo.buyQty) + (rewardElsewhere ? 0 : Math.max(1, promo.getQty));
  }
  return 1;
}

/** What a tap on the promotion card should add. Threshold deals apply by themselves. */
export function promoPlan(promo: Promo): PromoPlan {
  if (promo.kind === "threshold") {
    const off = promo.percent > 0 ? `${trimNumber(promo.percent)}%` : `₪${trimNumber(promo.amount)}`;
    return { mode: "info", detail: `חל לבד כשהסל מגיע ל־₪${trimNumber(promo.minSpend)}. ההנחה ${off}.` };
  }
  if (promo.kind === "combo") {
    const counts = new Map<string, number>();
    for (const id of promo.productIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { mode: "set", items: [...counts].map(([productId, qty]) => ({ productId, qty })) };
  }
  const extra =
    promo.kind === "bxgy" && promo.rewardProductId && promo.rewardProductId !== promo.productId
      ? [{ productId: promo.rewardProductId, qty: Math.max(1, promo.getQty) }]
      : [];
  if (!promo.productId && promo.categoryId) {
    return { mode: "choose", categoryId: promo.categoryId, qty: dealQty(promo), extra };
  }
  if (!promo.productId) return { mode: "info", detail: "המבצע חל על מה שכבר בסל." };
  return { mode: "set", items: [{ productId: promo.productId, qty: dealQty(promo) }, ...extra] };
}

type Unit = { index: number; productId: string; categoryId: string; price: number };

function expand(lines: CartLine[], products: Product[]): Unit[] {
  const category = new Map(products.map((product) => [product.id, product.categoryId]));
  const units: Unit[] = [];
  for (const line of lines) {
    const qty = Math.floor(line.qty);
    if (qty <= 0) continue;
    const productId = line.productId ?? "";
    for (let index = 0; index < qty; index += 1) {
      units.push({
        index: units.length,
        productId,
        categoryId: productId ? (category.get(productId) ?? "") : "",
        price: line.unitPrice,
      });
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

type Offer = { promo: Promo; amount: number; units: number[] };

function offer(promo: Promo, amount: number, units: number[]): Offer {
  return { promo, amount: roundMoney(amount), units: amount > 0 ? units : [] };
}

function rewardRate(promo: Promo): number {
  if (promo.kind === "bogo") return 100;
  return promo.rewardPercent > 0 ? Math.min(100, promo.rewardPercent) : 100;
}

function oneOffer(promo: Promo, units: Unit[]): Offer {
  const empty = offer(promo, 0, []);
  if (promo.kind === "percent" || promo.kind === "amount") {
    const matched = units.filter((unit) => targets(unit, promo));
    const gross = roundMoney(matched.reduce((sum, unit) => sum + unit.price, 0));
    if (gross <= 0) return empty;
    const amount = promo.kind === "percent" ? roundMoney((gross * promo.percent) / 100) : roundMoney(Math.min(promo.amount, gross));
    return offer(promo, amount, matched.map((unit) => unit.index));
  }
  if (promo.kind === "bundle") {
    if (promo.bundlePrice <= 0 || promo.buyQty < 1) return empty;
    const pool = units.filter((unit) => targets(unit, promo)).sort((a, b) => b.price - a.price);
    const sets = Math.floor(pool.length / promo.buyQty);
    let saved = 0;
    const used: number[] = [];
    for (let index = 0; index < sets; index += 1) {
      const chunk = pool.slice(index * promo.buyQty, (index + 1) * promo.buyQty);
      const sum = chunk.reduce((total, unit) => total + unit.price, 0);
      if (sum > promo.bundlePrice) saved += sum - promo.bundlePrice;
      for (const unit of chunk) used.push(unit.index);
    }
    return offer(promo, saved, used);
  }
  if (promo.kind === "nth") {
    const n = Math.max(2, promo.buyQty);
    if (promo.percent <= 0) return empty;
    const pool = units.filter((unit) => targets(unit, promo)).sort((a, b) => b.price - a.price);
    const sets = Math.floor(pool.length / n);
    let saved = 0;
    const used: number[] = [];
    for (let index = 0; index < sets; index += 1) {
      const chunk = pool.slice(index * n, (index + 1) * n);
      const cheapest = chunk[chunk.length - 1];
      saved += (cheapest.price * promo.percent) / 100;
      for (const unit of chunk) used.push(unit.index);
    }
    return offer(promo, saved, used);
  }
  if (promo.kind === "combo") {
    if (promo.bundlePrice <= 0 || promo.productIds.length < 2) return empty;
    const need = new Map<string, number>();
    for (const id of promo.productIds) need.set(id, (need.get(id) ?? 0) + 1);
    const pools = new Map<string, Unit[]>();
    for (const id of need.keys()) {
      pools.set(
        id,
        units.filter((unit) => unit.productId === id).sort((a, b) => b.price - a.price),
      );
    }
    let saved = 0;
    const used: number[] = [];
    for (;;) {
      const chunk: Unit[] = [];
      let ready = true;
      for (const [id, qty] of need) {
        const pool = pools.get(id) ?? [];
        if (pool.length < qty) {
          ready = false;
          break;
        }
        chunk.push(...pool.slice(0, qty));
      }
      if (!ready) break;
      for (const [id, qty] of need) pools.get(id)?.splice(0, qty);
      const sum = chunk.reduce((total, unit) => total + unit.price, 0);
      if (sum > promo.bundlePrice) saved += sum - promo.bundlePrice;
      for (const unit of chunk) used.push(unit.index);
    }
    return offer(promo, saved, used);
  }
  if (promo.kind === "threshold") {
    const scoped = promo.productId || promo.categoryId ? units.filter((unit) => targets(unit, promo)) : units;
    const gross = roundMoney(scoped.reduce((sum, unit) => sum + unit.price, 0));
    if (promo.minSpend <= 0 || gross < promo.minSpend) return empty;
    const amount = promo.percent > 0 ? roundMoney((gross * promo.percent) / 100) : roundMoney(Math.min(promo.amount, gross));
    return offer(promo, amount, scoped.map((unit) => unit.index));
  }
  const buyQty = Math.max(1, promo.kind === "bogo" ? 1 : promo.buyQty);
  const getQty = Math.max(1, promo.kind === "bogo" ? 1 : promo.getQty);
  const rate = rewardRate(promo);
  const buyPool = units.filter((unit) => targets(unit, promo));
  if (promo.rewardProductId && promo.rewardProductId !== promo.productId) {
    const rewards = units.filter((unit) => unit.productId === promo.rewardProductId);
    const sets = Math.floor(buyPool.length / buyQty);
    const free = Math.min(sets * getQty, rewards.length);
    if (free <= 0) return empty;
    const picked = [...rewards].sort((a, b) => a.price - b.price).slice(0, free);
    const amount = roundMoney((picked.reduce((sum, unit) => sum + unit.price, 0) * rate) / 100);
    const used = new Set(picked.map((unit) => unit.index));
    for (const unit of buyPool.slice(0, sets * buyQty)) used.add(unit.index);
    return offer(promo, amount, [...used]);
  }
  const sets = Math.floor(buyPool.length / (buyQty + getQty));
  const free = sets * getQty;
  if (free <= 0) return empty;
  const sorted = [...buyPool].sort((a, b) => a.price - b.price);
  const picked = sorted.slice(0, free);
  const amount = roundMoney((picked.reduce((sum, unit) => sum + unit.price, 0) * rate) / 100);
  return offer(promo, amount, sorted.slice(0, sets * (buyQty + getQty)).map((unit) => unit.index));
}

function capHits(hits: PromoHit[], gross: number): { amount: number; hits: PromoHit[] } {
  let room = roundMoney(Math.max(0, gross));
  const kept: PromoHit[] = [];
  for (const hit of hits) {
    if (room <= 0) break;
    const amount = roundMoney(Math.min(hit.amount, room));
    if (amount <= 0) continue;
    kept.push({ ...hit, amount });
    room = roundMoney(room - amount);
  }
  return { amount: roundMoney(kept.reduce((sum, hit) => sum + hit.amount, 0)), hits: kept };
}

function overlaps(used: Set<number>, units: number[]): boolean {
  return units.some((index) => used.has(index));
}

function bestExclusive(offers: Offer[], gross: number): { amount: number; hits: PromoHit[] } {
  const list = offers.filter((item) => !item.promo.stackable && item.amount > 0);
  if (!list.length) return { amount: 0, hits: [] };
  let bestHits: PromoHit[] = [];
  let bestAmount = 0;
  const consider = (chosen: Offer[]) => {
    const hits = chosen.map((item) => ({ id: item.promo.id, name: item.promo.name, amount: item.amount }));
    const capped = capHits(hits, gross);
    if (capped.amount > bestAmount) {
      bestAmount = capped.amount;
      bestHits = capped.hits;
    }
  };
  if (list.length > 16) {
    const used = new Set<number>();
    const chosen: Offer[] = [];
    for (const item of [...list].sort((a, b) => b.amount - a.amount)) {
      if (overlaps(used, item.units)) continue;
      for (const index of item.units) used.add(index);
      chosen.push(item);
    }
    consider(chosen);
    return { amount: bestAmount, hits: bestHits };
  }
  const limit = 1 << list.length;
  for (let mask = 1; mask < limit; mask += 1) {
    const used = new Set<number>();
    const chosen: Offer[] = [];
    let ok = true;
    for (let index = 0; index < list.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      if (overlaps(used, list[index].units)) {
        ok = false;
        break;
      }
      for (const unit of list[index].units) used.add(unit);
      chosen.push(list[index]);
    }
    if (ok) consider(chosen);
  }
  return { amount: bestAmount, hits: bestHits };
}

export function quotePromos(lines: CartLine[], products: Product[], promos: Promo[] | undefined, at = new Date()): { amount: number; hits: PromoHit[] } {
  const units = expand(lines, products);
  const gross = roundMoney(units.reduce((sum, unit) => sum + unit.price, 0));
  const offers = (promos ?? []).filter((promo) => promoOpen(promo, at)).map((promo) => oneOffer(promo, units)).filter((item) => item.amount > 0);
  const exclusive = bestExclusive(offers, gross);
  const stackHits: PromoHit[] = [];
  let stacked = 0;
  for (const item of offers.filter((entry) => entry.promo.stackable).sort((a, b) => b.amount - a.amount)) {
    const room = roundMoney(gross - stacked);
    if (room <= 0) break;
    const amount = roundMoney(Math.min(item.amount, room));
    stacked = roundMoney(stacked + amount);
    stackHits.push({ id: item.promo.id, name: item.promo.name, amount });
  }
  if (exclusive.amount >= stacked && exclusive.amount > 0) return exclusive;
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

export function promoRows(sale: { promoAmount?: number; promoLabel?: string; promoHits?: PromoHit[] }): { name: string; amount: number }[] {
  const hits = (sale.promoHits ?? []).filter((hit) => hit && hit.amount > 0 && hit.name);
  if (hits.length) return hits.map((hit) => ({ name: hit.name, amount: hit.amount }));
  if ((sale.promoAmount ?? 0) > 0) return [{ name: sale.promoLabel?.trim() || "מבצע", amount: sale.promoAmount ?? 0 }];
  return [];
}
