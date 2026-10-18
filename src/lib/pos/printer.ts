import { formatILS, formatWhen } from "@/lib/pos/money";
import { tendersOf } from "@/lib/pos/tender";
import { deviceLabel } from "@/lib/pos/terminal";
import { registerCaption } from "@/lib/pos/register";
import { METHOD_LABEL, type PaymentMethod, type Sale, type Settings, type TenderLine } from "@/lib/pos/types";

/** Product name of the USB thermal printer the register looks for first. */
export const DEFAULT_PRINTER_NAME = "Default";

export type PaperWidth = 58 | 80;

export type UsbPrinterInfo = {
  name: string;
  deviceName: string;
  vendorId: number;
  productId: number;
  printer: boolean;
  hasPermission: boolean;
};

export type PrintAlign = "center" | "right" | "split";

export type PrintLine = {
  text: string;
  align: PrintAlign;
  bold?: boolean;
  size?: "sm" | "md" | "lg";
};

export type ReceiptJob = {
  printerName: string;
  paperMm: PaperWidth;
  kickDrawer: boolean;
  lines: PrintLine[];
};

type PrintPrefs = {
  autoPrint: boolean;
  paperWidth: PaperWidth;
  printerName: string;
  openDrawer: boolean;
};

function readField(raw: object, key: string): unknown {
  return (raw as Record<string, unknown>)[key];
}

/** Missing keys keep the safe defaults so older saved registers keep printing. */
export function normalizePrintSettings(raw: object | null | undefined): PrintPrefs {
  const source = raw && typeof raw === "object" ? raw : {};
  const paper = readField(source, "paperWidth");
  const name = readField(source, "printerName");
  const trimmed = typeof name === "string" ? name.trim().slice(0, 64) : "";
  return {
    autoPrint: readField(source, "autoPrint") !== false,
    paperWidth: paper === 58 ? 58 : 80,
    printerName: trimmed || DEFAULT_PRINTER_NAME,
    openDrawer: readField(source, "openDrawer") !== false,
  };
}

export function withPrintSettings<T extends Settings>(settings: T): T {
  return { ...settings, ...normalizePrintSettings(settings) };
}

/**
 * Prefer the printer whose product name matches (default "Default").
 * Otherwise the first printer-class device, in device-path order.
 * Null means the caller should use window.print.
 */
export function pickPrinter(devices: UsbPrinterInfo[], preferredName = DEFAULT_PRINTER_NAME): UsbPrinterInfo | null {
  const ordered = [...devices].sort((a, b) => a.deviceName.localeCompare(b.deviceName));
  const wanted = preferredName.trim().toLocaleLowerCase();
  if (wanted) {
    const named = ordered.find((device) => device.name.trim().toLocaleLowerCase() === wanted);
    if (named) return named;
  }
  return ordered.find((device) => device.printer) ?? null;
}

export function paperDots(paper: PaperWidth): number {
  return paper === 58 ? 384 : 576;
}

export function saleHasCash(sale: Pick<Sale, "method" | "amountDue" | "tendered" | "change" | "rounding" | "payments" | "terminal" | "authCode" | "cardLast4" | "cardBrand" | "tenders">): boolean {
  return tendersOf(sale).some((line) => line.method === "cash");
}

function clip(value: string, max = 48): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tenderLabel(line: TenderLine): string {
  const parts: string[] = [METHOD_LABEL[line.method] ?? "תשלום"];
  if (line.terminal) parts.push(deviceLabel(line.terminal));
  if ((line.payments ?? 1) > 1) parts.push(`${line.payments} תשלומים`);
  if (line.voucherCode) parts.push(line.voucherCode);
  return parts.join(" · ");
}

export function receiptPrintLines(sale: Sale): PrintLine[] {
  const credit = sale.kind === "credit";
  const testing = sale.id === "printer-test";
  const lines: PrintLine[] = [
    { text: clip(sale.business.businessName, 32) || "קבלה", align: "center", bold: true, size: "lg" },
  ];
  if (sale.business.ownerName) lines.push({ text: clip(sale.business.ownerName, 32), align: "center" });
  if (sale.business.taxId) lines.push({ text: clip(`עוסק מורשה ${sale.business.taxId}`), align: "center", size: "sm" });
  if (sale.business.address) lines.push({ text: clip(sale.business.address), align: "center", size: "sm" });
  if (sale.business.phone) lines.push({ text: clip(sale.business.phone), align: "center", size: "sm" });
  lines.push({ text: "", align: "center", size: "sm" });
  lines.push({
    text: testing ? "בדיקת הדפסה" : credit ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`,
    align: "right",
    bold: true,
  });
  if (credit && sale.creditOfNumber) lines.push({ text: `עבור קבלה ${sale.creditOfNumber}`, align: "right", size: "sm" });
  if (sale.cashierName) lines.push({ text: `קופאי ${clip(sale.cashierName, 24)}`, align: "right", size: "sm" });
  const register = registerCaption(sale.registerNo, sale.registerName);
  if (register) lines.push({ text: register, align: "right", size: "sm" });
  if (sale.channel === "kiosk") lines.push({ text: "הזמנת קיוסק", align: "right", size: "sm" });
  lines.push({ text: formatWhen(sale.createdAt), align: "right", size: "sm" });
  if (sale.voided) lines.push({ text: "מבוטלת", align: "center", bold: true });
  lines.push({ text: "", align: "center", size: "sm" });
  for (const line of sale.lines) {
    lines.push({ text: `${clip(line.name, 28)} × ${line.qty}\t${formatILS(line.lineTotal)}`, align: "split" });
  }
  lines.push({ text: "", align: "center", size: "sm" });
  if ((sale.promoAmount ?? 0) > 0) lines.push({ text: `מבצע${sale.promoLabel ? ` ${sale.promoLabel}` : ""}\t${formatILS(sale.promoAmount ?? 0)}`, align: "split" });
  if (sale.discountAmount > 0) lines.push({ text: `הנחה\t${formatILS(sale.discountAmount)}`, align: "split" });
  lines.push({
    text: `${credit ? "זיכוי" : "לתשלום"}\t${formatILS(sale.total)}`,
    align: "split",
    bold: true,
  });
  lines.push({ text: `מע״מ ${sale.vatRate}%\t${formatILS(sale.vatAmount)}`, align: "split", size: "sm" });
  if (sale.rounding !== 0) lines.push({ text: `עיגול מזומן\t${formatILS(sale.rounding)}`, align: "split", size: "sm" });
  for (const line of tendersOf(sale)) {
    const change = line.change > 0 ? `  עודף ${formatILS(line.change)}` : "";
    lines.push({
      text: `${credit ? "הוחזר" : "שולם"} ${tenderLabel(line)}\t${formatILS(line.amount)}${change}`,
      align: "split",
    });
  }
  if (sale.authCode) lines.push({ text: `אישור ${sale.authCode}`, align: "right", size: "sm" });
  if (sale.cardLast4) lines.push({ text: `כרטיס ****${sale.cardLast4}${sale.cardBrand ? ` ${sale.cardBrand}` : ""}`, align: "right", size: "sm" });
  lines.push({ text: "", align: "center", size: "sm" });
  if (sale.business.receiptFooter) lines.push({ text: clip(sale.business.receiptFooter, 80), align: "center", size: "sm" });
  lines.push({ text: "קבלה פנימית. אינה חשבונית מס.", align: "center", size: "sm" });
  return lines;
}

export function buildReceiptJob(sale: Sale, settings: Settings, kick: boolean): ReceiptJob {
  const prefs = normalizePrintSettings(settings);
  return {
    printerName: prefs.printerName,
    paperMm: prefs.paperWidth,
    kickDrawer: kick && prefs.openDrawer,
    lines: receiptPrintLines(sale).slice(0, 80),
  };
}

export function testSale(settings: Settings): Sale {
  const business = {
    businessName: settings.businessName,
    ownerName: settings.ownerName,
    taxId: settings.taxId,
    address: settings.address,
    phone: settings.phone,
    receiptFooter: settings.receiptFooter,
  };
  return {
    id: "printer-test",
    number: 0,
    createdAt: new Date().toISOString(),
    lines: [{ productId: null, name: "בדיקת מדפסת", unitPrice: 0, qty: 1, lineTotal: 0 }],
    discountAmount: 0,
    total: 0,
    vatRate: settings.vatRate,
    vatAmount: 0,
    net: 0,
    method: "cash" satisfies PaymentMethod,
    tenders: [],
    kind: "sale",
    amountDue: 0,
    rounding: 0,
    tendered: 0,
    change: 0,
    voided: false,
    zId: null,
    cashierName: "",
    business,
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** One-page PDF whose only content is a JPEG of the receipt. Built locally, no network. */
export function jpegToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const width = Math.max(1, Math.round(widthPx));
  const height = Math.max(1, Math.round(heightPx));
  const pageW = Math.max(1, Math.round((width / 203) * 72));
  const pageH = Math.max(1, Math.round((height / 203) * 72));
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets = [0, 0, 0, 0, 0, 0];
  const add = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const addText = (value: string) => add(enc.encode(value));
  const addObj = (index: number, body: string) => {
    offsets[index] = length;
    addText(`${index} 0 obj\n${body}\nendobj\n`);
  };

  add(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  addObj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
  );
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  addObj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  offsets[5] = length;
  addText(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  add(jpeg);
  addText("\nendstream\nendobj\n");
  const xrefAt = length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  addText(xref);
  return concat(parts);
}
