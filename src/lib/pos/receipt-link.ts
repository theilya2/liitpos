import { formatILS, formatWhen } from "@/lib/pos/money";
import { isPaymentMethod, tendersOf } from "@/lib/pos/tender";
import { METHOD_LABEL, type PaymentMethod, type Sale, type SaleLine, type TenderLine } from "@/lib/pos/types";

/** Public host for customer receipt links. The register itself may be offline. */
export const RECEIPT_ORIGIN = "https://liitpos.vercel.app";

const TOKEN = /^[A-Za-z0-9_-]{22,64}$/;

export function isReceiptToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function newReceiptToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function receiptUrl(token: string): string {
  return `${RECEIPT_ORIGIN}/r/${token}`;
}

export function saleCloudId(businessId: string, saleId: string): string {
  return `sale:${businessId}:${saleId}`;
}

function methodsOf(sale: Sale): string {
  const seen = new Set<PaymentMethod>();
  const labels: string[] = [];
  for (const line of tendersOf(sale)) {
    if (seen.has(line.method)) continue;
    seen.add(line.method);
    labels.push(METHOD_LABEL[line.method] ?? "תשלום");
  }
  return labels.join(", ");
}

/** Short Hebrew text for the SMS composer. The link is added only when the sale is already on the server. */
export function receiptSmsBody(sale: Sale, url: string | null): string {
  const credit = sale.kind === "credit";
  const lines = [
    sale.business.businessName,
    formatWhen(sale.createdAt),
    credit ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`,
    `${credit ? "זיכוי" : "סה״כ"} ${formatILS(sale.total)}`,
    methodsOf(sale),
  ];
  if (url) lines.push(url);
  return lines.filter((line) => line.trim()).join("\n");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function publicTender(value: unknown): TenderLine | null {
  if (!value || typeof value !== "object") return null;
  const line = value as Partial<TenderLine>;
  if (!isPaymentMethod(String(line.method ?? ""))) return null;
  const amount = Number(line.amount);
  if (!Number.isFinite(amount)) return null;
  const tendered = Number(line.tendered);
  const change = Number(line.change);
  const rounding = Number(line.rounding);
  return {
    method: line.method as TenderLine["method"],
    amount,
    tendered: Number.isFinite(tendered) ? tendered : amount,
    change: Number.isFinite(change) ? change : 0,
    rounding: Number.isFinite(rounding) ? rounding : 0,
    payments: typeof line.payments === "number" ? line.payments : undefined,
    terminal: line.terminal === "android" || line.terminal === "pinpad" ? line.terminal : null,
    authCode: text(line.authCode, 16),
    cardLast4: text(line.cardLast4, 4),
    cardBrand: text(line.cardBrand, 24),
    voucherCode: text(line.voucherCode, 40),
  };
}

function publicLine(value: unknown): SaleLine | null {
  if (!value || typeof value !== "object") return null;
  const line = value as Partial<SaleLine>;
  if (typeof line.name !== "string") return null;
  const qty = Number(line.qty);
  const unitPrice = Number(line.unitPrice);
  const lineTotal = Number(line.lineTotal);
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice) || !Number.isFinite(lineTotal)) return null;
  return {
    productId: typeof line.productId === "string" ? line.productId : null,
    name: line.name.slice(0, 80),
    unitPrice,
    qty,
    lineTotal,
    sourceIndex: typeof line.sourceIndex === "number" ? line.sourceIndex : undefined,
  };
}

/** Customer-facing sale. The lookup token is not copied onto the page. */
export function toPublicSale(doc: unknown): Sale | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const raw = doc as Partial<Sale>;
  if (typeof raw.id !== "string" || typeof raw.number !== "number" || !Array.isArray(raw.lines)) return null;
  const business = raw.business;
  if (!business || typeof business !== "object" || typeof business.businessName !== "string") return null;
  const lines = raw.lines.map(publicLine).filter((line): line is SaleLine => Boolean(line)).slice(0, 80);
  if (!lines.length) return null;
  const method = raw.method && raw.method in METHOD_LABEL ? raw.method : "cash";
  return {
    id: raw.id.slice(0, 80),
    number: raw.number,
    createdAt: text(raw.createdAt, 40),
    lines,
    discountAmount: Number(raw.discountAmount) || 0,
    promoAmount: Number(raw.promoAmount) > 0 ? Number(raw.promoAmount) : undefined,
    promoLabel: typeof raw.promoLabel === "string" && raw.promoLabel.trim() ? raw.promoLabel.trim().slice(0, 80) : undefined,
    total: Number(raw.total) || 0,
    vatRate: Number(raw.vatRate) || 0,
    vatAmount: Number(raw.vatAmount) || 0,
    net: Number(raw.net) || 0,
    method,
    kind: raw.kind === "credit" ? "credit" : "sale",
    creditOfNumber: typeof raw.creditOfNumber === "number" ? raw.creditOfNumber : null,
    amountDue: Number(raw.amountDue) || 0,
    rounding: Number(raw.rounding) || 0,
    tendered: Number(raw.tendered) || 0,
    change: Number(raw.change) || 0,
    voided: raw.voided === true,
    zId: null,
    cashierName: text(raw.cashierName, 40),
    business: {
      businessName: business.businessName.slice(0, 40),
      ownerName: text(business.ownerName, 40),
      taxId: text(business.taxId, 20),
      address: text(business.address, 80),
      phone: text(business.phone, 20),
      receiptFooter: text(business.receiptFooter, 160),
    },
    payments: typeof raw.payments === "number" ? raw.payments : undefined,
    terminal: raw.terminal === "android" || raw.terminal === "pinpad" ? raw.terminal : null,
    authCode: text(raw.authCode, 16),
    cardLast4: text(raw.cardLast4, 4),
    cardBrand: text(raw.cardBrand, 24),
    channel: raw.channel === "kiosk" ? "kiosk" : "register",
    tenders: Array.isArray(raw.tenders) ? raw.tenders.slice(0, 12).map(publicTender).filter((line): line is TenderLine => Boolean(line)) : undefined,
  };
}
