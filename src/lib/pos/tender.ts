import { roundCash, roundMoney } from "@/lib/pos/money";
import { METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod, type Sale, type SaleLine, type TenderLine, type TerminalKind, type ZReport } from "@/lib/pos/types";

export type TenderInput = {
  method: PaymentMethod;
  /** Cash handed over, or the amount to charge for every other method. */
  tendered: number;
  payments?: number;
  terminal?: TerminalKind | null;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  voucherCode?: string;
};

export type RefundPick = { index: number; qty: number };

export type RefundQuote = {
  lines: SaleLine[];
  total: number;
  vat: number;
  net: number;
  vatRate: number;
  discountAmount: number;
};

export type ShiftFigures = {
  salesCount: number;
  voidCount: number;
  creditCount: number;
  gross: number;
  creditTotal: number;
  turnover: number;
  vat: number;
  net: number;
  rounding: number;
  cashTaken: number;
  cashRefunds: number;
  byMethod: { method: PaymentMethod; sales: number; refunds: number; total: number }[];
};

const EPS = 0.001;

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isCredit(sale: Pick<Sale, "kind">): boolean {
  return sale.kind === "credit";
}

function cleanCard(input: TenderInput): Pick<TenderLine, "payments" | "terminal" | "authCode" | "cardLast4" | "cardBrand" | "voucherCode"> {
  const card = input.method === "card" || input.method === "club";
  return {
    payments: card ? Math.min(12, Math.max(1, Math.round(input.payments ?? 1))) : 1,
    terminal: input.method === "cash" ? null : (input.terminal ?? null),
    authCode: (input.authCode ?? "").slice(0, 16),
    cardLast4: (input.cardLast4 ?? "").replace(/\D/g, "").slice(-4),
    cardBrand: (input.cardBrand ?? "").slice(0, 24),
    voucherCode: input.method === "voucher" ? (input.voucherCode ?? "").slice(0, 12) : "",
  };
}

export function tendersOf(sale: Pick<Sale, "method" | "amountDue" | "tendered" | "change" | "rounding" | "payments" | "terminal" | "authCode" | "cardLast4" | "cardBrand" | "tenders">): TenderLine[] {
  if (Array.isArray(sale.tenders) && sale.tenders.length) {
    return sale.tenders.map((line) => ({
      method: isPaymentMethod(line.method) ? line.method : "cash",
      amount: roundMoney(line.amount),
      tendered: roundMoney(line.tendered),
      change: roundMoney(line.change),
      rounding: roundMoney(line.rounding),
      payments: line.payments,
      terminal: line.terminal ?? null,
      authCode: line.authCode,
      cardLast4: line.cardLast4,
      cardBrand: line.cardBrand,
      voucherCode: line.voucherCode,
    }));
  }
  const method = isPaymentMethod(sale.method) ? sale.method : "cash";
  const amount = roundMoney(sale.amountDue);
  const tendered = method === "cash" ? roundMoney(sale.tendered) : amount;
  return [
    {
      method,
      amount,
      tendered,
      change: method === "cash" ? roundMoney(sale.change) : 0,
      rounding: roundMoney(sale.rounding ?? 0),
      payments: sale.payments,
      terminal: sale.terminal ?? null,
      authCode: sale.authCode,
      cardLast4: sale.cardLast4,
      cardBrand: sale.cardBrand,
    },
  ];
}

export function coveredExact(tenders: Pick<TenderLine, "amount" | "rounding">[]): number {
  return roundMoney(tenders.reduce((sum, line) => sum + line.amount - line.rounding, 0));
}

export function remainingExact(total: number, tenders: Pick<TenderLine, "amount" | "rounding">[]): number {
  return roundMoney(Math.max(0, total - coveredExact(tenders)));
}

/** One slice against the exact remainder. Cash may overpay; other methods may not. */
export function previewTender(remaining: number, input: TenderInput): TenderLine | null {
  const left = roundMoney(remaining);
  const tendered = roundMoney(input.tendered);
  if (!(left > EPS) || !(tendered > EPS)) return null;
  if (input.method === "cash") {
    const due = roundCash(left);
    if (tendered + EPS >= due) {
      return {
        method: "cash",
        amount: due,
        tendered,
        change: roundMoney(Math.max(0, tendered - due)),
        rounding: roundMoney(due - left),
        ...cleanCard(input),
      };
    }
    return {
      method: "cash",
      amount: tendered,
      tendered,
      change: 0,
      rounding: 0,
      ...cleanCard(input),
    };
  }
  if (tendered > left + EPS) return null;
  const amount = roundMoney(Math.min(tendered, left));
  return {
    method: input.method,
    amount,
    tendered: amount,
    change: 0,
    rounding: 0,
    ...cleanCard(input),
  };
}

export function foldTenders(total: number, inputs: TenderInput[]): { tenders: TenderLine[]; remaining: number } | null {
  if (!(total > EPS)) return null;
  const tenders: TenderLine[] = [];
  for (const input of inputs) {
    const line = previewTender(remainingExact(total, tenders), input);
    if (!line) return null;
    tenders.push(line);
  }
  return { tenders, remaining: remainingExact(total, tenders) };
}

export function settleSale(total: number, inputs: TenderInput[]): {
  tenders: TenderLine[];
  amountDue: number;
  tendered: number;
  change: number;
  rounding: number;
  method: PaymentMethod;
  payments: number;
} | null {
  const folded = foldTenders(total, inputs);
  if (!folded || folded.remaining > EPS) return null;
  const { tenders } = folded;
  const amountDue = roundMoney(tenders.reduce((sum, line) => sum + line.amount, 0));
  const tendered = roundMoney(tenders.reduce((sum, line) => sum + line.tendered, 0));
  const change = roundMoney(tenders.reduce((sum, line) => sum + line.change, 0));
  const rounding = roundMoney(tenders.reduce((sum, line) => sum + line.rounding, 0));
  const biggest = [...tenders].sort((a, b) => b.amount - a.amount)[0];
  const card = tenders.find((line) => line.method === "card" || line.method === "club");
  return {
    tenders,
    amountDue,
    tendered,
    change,
    rounding,
    method: tenders.every((line) => line.method === tenders[0].method) ? tenders[0].method : biggest.method,
    payments: card?.payments ?? 1,
  };
}

export function methodSummary(sale: Parameters<typeof tendersOf>[0]): string {
  const names = [...new Set(tendersOf(sale).map((line) => METHOD_LABEL[line.method]))];
  return names.join(" + ");
}

export function refundedQty(saleId: string, credits: Pick<Sale, "kind" | "voided" | "creditOfId" | "lines">[], index: number): number {
  let qty = 0;
  for (const credit of credits) {
    if (credit.kind !== "credit" || credit.voided || credit.creditOfId !== saleId) continue;
    for (const line of credit.lines) {
      if (line.sourceIndex === index) qty += line.qty;
    }
  }
  return roundMoney(qty);
}

export function quoteRefund(sale: Sale, credits: Sale[], picks: RefundPick[]): RefundQuote | null {
  if (sale.voided || isCredit(sale) || !sale.lines.length) return null;
  const chosen = new Map<number, number>();
  for (const pick of picks) {
    if (!Number.isInteger(pick.index) || pick.index < 0 || pick.index >= sale.lines.length) return null;
    const qty = roundMoney(pick.qty);
    if (!(qty > EPS)) continue;
    chosen.set(pick.index, roundMoney((chosen.get(pick.index) ?? 0) + qty));
  }
  if (!chosen.size) return null;
  const lines: SaleLine[] = [];
  let returnsAll = true;
  let pickedGross = 0;
  for (let index = 0; index < sale.lines.length; index += 1) {
    const line = sale.lines[index];
    const left = roundMoney(line.qty - refundedQty(sale.id, credits, index));
    const qty = chosen.get(index) ?? 0;
    if (qty > left + EPS) return null;
    if (roundMoney(left - qty) > EPS) returnsAll = false;
    if (!(qty > EPS)) continue;
    const lineTotal = roundMoney(line.unitPrice * qty);
    pickedGross = roundMoney(pickedGross + lineTotal);
    lines.push({
      productId: line.productId,
      variantId: line.variantId ?? null,
      sku: line.sku ?? "",
      name: line.name,
      unitPrice: line.unitPrice,
      qty,
      lineTotal,
      sourceIndex: index,
      modifiers: line.modifiers ?? [],
    });
  }
  if (!lines.length) return null;
  const alreadyMoney = roundMoney(
    credits
      .filter((credit) => credit.kind === "credit" && !credit.voided && credit.creditOfId === sale.id)
      .reduce((sum, credit) => sum + credit.amountDue, 0),
  );
  const leftMoney = roundMoney(sale.amountDue - alreadyMoney);
  if (!(leftMoney > EPS)) return null;
  const saleGross = roundMoney(sale.lines.reduce((sum, line) => sum + line.lineTotal, 0));
  let total: number;
  if (returnsAll) {
    total = leftMoney;
  } else {
    const share = saleGross > EPS ? pickedGross / saleGross : 0;
    const discount = roundMoney(sale.discountAmount * share);
    total = roundMoney(Math.min(leftMoney, Math.max(0, pickedGross - discount)));
  }
  if (!(total > EPS)) return null;
  const vat = roundMoney((total * sale.vatRate) / (100 + sale.vatRate));
  return {
    lines,
    total,
    vat,
    net: roundMoney(total - vat),
    vatRate: sale.vatRate,
    discountAmount: roundMoney(Math.max(0, pickedGross - total)),
  };
}

export function refundMethodsFor(sale: Sale): PaymentMethod[] {
  const allowed = new Set<PaymentMethod>(["cash", "voucher"]);
  for (const line of tendersOf(sale)) allowed.add(line.method);
  return PAYMENT_METHODS.filter((method) => allowed.has(method));
}

export function zFigures(docs: Sale[]): ShiftFigures {
  const sales = docs.filter((sale) => !sale.voided && !isCredit(sale));
  const credits = docs.filter((sale) => !sale.voided && isCredit(sale));
  const voids = docs.filter((sale) => sale.voided && !isCredit(sale));
  const byMethod = PAYMENT_METHODS.map((method) => {
    const salesTotal = roundMoney(
      sales.reduce((sum, sale) => sum + tendersOf(sale).filter((line) => line.method === method).reduce((inner, line) => inner + line.amount, 0), 0),
    );
    const refunds = roundMoney(
      credits.reduce((sum, sale) => sum + tendersOf(sale).filter((line) => line.method === method).reduce((inner, line) => inner + line.amount, 0), 0),
    );
    return { method, sales: salesTotal, refunds, total: roundMoney(salesTotal - refunds) };
  }).filter((row) => row.sales > EPS || row.refunds > EPS);
  const gross = roundMoney(sales.reduce((sum, sale) => sum + sale.amountDue, 0));
  const creditTotal = roundMoney(credits.reduce((sum, sale) => sum + sale.amountDue, 0));
  const cashRefunds = byMethod.find((row) => row.method === "cash")?.refunds ?? 0;
  const cashSales = byMethod.find((row) => row.method === "cash")?.sales ?? 0;
  return {
    salesCount: sales.length,
    voidCount: voids.length,
    creditCount: credits.length,
    gross,
    creditTotal,
    turnover: roundMoney(gross - creditTotal),
    vat: roundMoney(sales.reduce((sum, sale) => sum + sale.vatAmount, 0) - credits.reduce((sum, sale) => sum + sale.vatAmount, 0)),
    net: roundMoney(sales.reduce((sum, sale) => sum + sale.net, 0) - credits.reduce((sum, sale) => sum + sale.net, 0)),
    rounding: roundMoney(sales.reduce((sum, sale) => sum + sale.rounding, 0) - credits.reduce((sum, sale) => sum + sale.rounding, 0)),
    cashTaken: roundMoney(cashSales - cashRefunds),
    cashRefunds,
    byMethod,
  };
}

export function figuresToReport(figures: ShiftFigures): Pick<ZReport, "salesCount" | "voidCount" | "turnover" | "vat" | "net" | "byMethod" | "cashTaken" | "creditCount" | "creditTotal" | "grossTurnover" | "cashRefunds"> {
  return {
    salesCount: figures.salesCount,
    voidCount: figures.voidCount,
    turnover: figures.turnover,
    vat: figures.vat,
    net: figures.net,
    byMethod: figures.byMethod,
    cashTaken: figures.cashTaken,
    creditCount: figures.creditCount,
    creditTotal: figures.creditTotal,
    grossTurnover: figures.gross,
    cashRefunds: figures.cashRefunds,
  };
}
