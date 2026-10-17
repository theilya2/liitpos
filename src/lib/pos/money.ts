import type { Discount } from "@/lib/pos/types";

export type Totals = {
  gross: number;
  discountAmount: number;
  total: number;
  vat: number;
  net: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Cash in Israel is settled to the nearest 10 agorot. */
export function roundCash(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeTotals(
  lines: { unitPrice: number; qty: number }[],
  discount: Discount,
  vatRate: number,
): Totals {
  const gross = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.unitPrice * line.qty), 0));
  let discountAmount = 0;
  if (discount && discount.value > 0 && gross > 0) {
    discountAmount =
      discount.kind === "percent"
        ? roundMoney((gross * discount.value) / 100)
        : roundMoney(Math.min(discount.value, gross));
  }
  const total = roundMoney(Math.max(0, gross - discountAmount));
  const rate = Number.isFinite(vatRate) ? vatRate : 0;
  const vat = roundMoney((total * rate) / (100 + rate));
  const net = roundMoney(total - vat);
  return { gross, discountAmount, total, vat, net };
}

export function formatILS(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pushMoneyKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "clear") return "";
  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : `${current}.`;
  }
  if (!/^\d$/.test(key)) return current;
  const next = current === "0" ? key : current + key;
  const fraction = next.split(".")[1];
  if (fraction && fraction.length > 2) return current;
  if (Number(next) > 99999) return current;
  return next;
}

export function moneyFromPad(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
