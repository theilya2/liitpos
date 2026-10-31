import { formatILS, roundMoney } from "@/lib/pos/money";
import type { Discount } from "@/lib/pos/types";

export type DiscountLine = { name: string; amount: number };

function trimValue(value: number): string {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** "הנחה 10%" or "הנחה ₪5". Older sales with no saved kind stay "הנחה". */
export function discountLabel(discount: Discount | undefined): string {
  if (!discount || !(discount.value > 0)) return "הנחה";
  if (discount.kind === "percent") return `הנחה ${trimValue(discount.value)}%`;
  return `הנחה ₪${trimValue(discount.value)}`;
}

export function manualDiscountRow(discount: Discount | undefined, amount: number): DiscountLine | null {
  if (!(amount > 0)) return null;
  return { name: discountLabel(discount), amount };
}

export function savedDiscountLine(sale: { discountAmount?: number; discountLabel?: string }): DiscountLine | null {
  if (!((sale.discountAmount ?? 0) > 0)) return null;
  const name = sale.discountLabel?.trim() || "הנחה";
  return { name, amount: sale.discountAmount ?? 0 };
}

/** Negative currency, so the line reads as money taken off. */
export function formatDiscountAmount(amount: number): string {
  return formatILS(-Math.abs(amount));
}

export function discountLinesOf(sales: { discountAmount?: number; discountLabel?: string; kind?: string; voided?: boolean }[]): DiscountLine[] {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.voided || sale.kind === "credit") continue;
    const line = savedDiscountLine(sale);
    if (!line) continue;
    totals.set(line.name, roundMoney((totals.get(line.name) ?? 0) + line.amount));
  }
  return [...totals].map(([name, amount]) => ({ name, amount }));
}
