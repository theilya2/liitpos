import assert from "node:assert/strict";
import test from "node:test";
import { cloneSettings } from "@/lib/pos/seed.ts";
import {
  DEFAULT_PRINTER_NAME,
  buildReceiptJob,
  jpegToPdf,
  normalizePrintSettings,
  paperDots,
  pickPrinter,
  receiptPrintLines,
  saleHasCash,
  type UsbPrinterInfo,
} from "@/lib/pos/printer.ts";
import type { Sale } from "@/lib/pos/types.ts";

function device(partial: Partial<UsbPrinterInfo> & Pick<UsbPrinterInfo, "deviceName">): UsbPrinterInfo {
  return {
    name: "",
    vendorId: 1,
    productId: 1,
    printer: false,
    hasPermission: true,
    ...partial,
  };
}

function sale(partial: Partial<Sale> = {}): Sale {
  const settings = cloneSettings();
  return {
    id: "sale-1",
    number: 12,
    createdAt: "2026-04-02T10:30:00.000Z",
    lines: [{ productId: null, name: "קפה", unitPrice: 10, qty: 2, lineTotal: 20 }],
    discountAmount: 0,
    total: 20,
    vatRate: 18,
    vatAmount: 3.05,
    net: 16.95,
    method: "cash",
    amountDue: 20,
    rounding: 0,
    tendered: 20,
    change: 0,
    voided: false,
    zId: null,
    cashierName: "נועה",
    business: settings,
    ...partial,
  };
}

test("pickPrinter prefers the product name Default, then the first printer", () => {
  const mouse = device({ deviceName: "/dev/bus/usb/001/001", name: "Hub" });
  const other = device({ deviceName: "/dev/bus/usb/001/004", name: "TM-T20", printer: true });
  const named = device({ deviceName: "/dev/bus/usb/001/009", name: "Default", printer: false });
  assert.equal(pickPrinter([other, mouse, named])?.deviceName, named.deviceName);
  assert.equal(pickPrinter([other, mouse, { ...named, name: "DEFAULT" }])?.deviceName, named.deviceName);
  assert.equal(pickPrinter([other, mouse])?.deviceName, other.deviceName);
  const later = device({ deviceName: "/dev/bus/usb/001/002", name: "POS", printer: true });
  const earlier = device({ deviceName: "/dev/bus/usb/001/008", name: "POS-2", printer: true });
  assert.equal(pickPrinter([earlier, later])?.deviceName, later.deviceName);
  assert.equal(pickPrinter([mouse]), null);
  assert.equal(pickPrinter([named], "TM-T20"), null);
  assert.equal(pickPrinter([other], "tm-t20")?.name, "TM-T20");
});

test("older settings keep auto-print and the Default printer", () => {
  const legacy = normalizePrintSettings({ businessName: "מכולת" });
  assert.equal(legacy.autoPrint, true);
  assert.equal(legacy.openDrawer, true);
  assert.equal(legacy.paperWidth, 80);
  assert.equal(legacy.printerName, DEFAULT_PRINTER_NAME);
  assert.equal(normalizePrintSettings({ autoPrint: false, openDrawer: false, paperWidth: 58, printerName: "  דלפק  " }).autoPrint, false);
  assert.equal(normalizePrintSettings({ autoPrint: false }).openDrawer, true);
  assert.deepEqual(normalizePrintSettings({ autoPrint: false, openDrawer: false, paperWidth: 58, printerName: "דלפק" }), {
    autoPrint: false,
    openDrawer: false,
    paperWidth: 58,
    printerName: "דלפק",
  });
  assert.equal(normalizePrintSettings({ paperWidth: 57, printerName: "   " }).paperWidth, 80);
  assert.equal(paperDots(58), 384);
  assert.equal(paperDots(80), 576);
});

test("receipt lines include Hebrew, split tender, and credit notes", () => {
  const paid = sale({
    tenders: [
      { method: "cash", amount: 10, tendered: 20, change: 10, rounding: 0 },
      { method: "card", amount: 10, tendered: 10, change: 0, rounding: 0, authCode: "4455" },
    ],
  });
  const lines = receiptPrintLines(paid);
  assert.ok(lines.some((line) => line.text.includes("קבלה 12")));
  assert.ok(lines.some((line) => line.text.includes("קפה") && line.align === "split"));
  assert.ok(lines.some((line) => line.text.includes("מזומן")));
  assert.ok(lines.some((line) => line.text.includes("אשראי")));
  assert.equal(saleHasCash(paid), true);
  const job = buildReceiptJob(paid, cloneSettings(), true);
  assert.equal(job.kickDrawer, true);
  assert.equal(job.printerName, "Default");
  assert.equal(job.paperMm, 80);
  const quiet = buildReceiptJob(paid, { ...cloneSettings(), openDrawer: false }, true);
  assert.equal(quiet.kickDrawer, false);
  const credit = receiptPrintLines(sale({ kind: "credit", number: 3, creditOfNumber: 12, method: "card", tendered: 20, change: 0 }));
  assert.ok(credit.some((line) => line.text.includes("תעודת זיכוי 3")));
  assert.ok(credit.some((line) => line.text.includes("עבור קבלה 12")));
  assert.equal(saleHasCash(sale({ method: "card", tendered: 20, change: 0, tenders: undefined })), false);
});

test("jpegToPdf wraps the image bytes without a network call", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 9, 8, 7]);
  const pdf = jpegToPdf(jpeg, 384, 200);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.includes("/Filter /DCTDecode"));
  assert.ok(text.includes("/Width 384"));
  assert.ok(text.includes("%%EOF"));
  const start = pdf.indexOf(jpeg[0]);
  assert.ok(start > 0);
  assert.deepEqual(pdf.slice(start, start + jpeg.length), jpeg);
  const xref = indexOfAscii(pdf, "xref");
  const obj = indexOfAscii(pdf, "1 0 obj");
  const offset = text.slice(xref).match(/0000000000 65535 f \n(\d{10}) 00000 n/);
  assert.ok(offset);
  assert.equal(Number(offset[1]), obj);
});

function indexOfAscii(bytes: Uint8Array, needle: string): number {
  const raw = new TextEncoder().encode(needle);
  outer: for (let index = 0; index <= bytes.length - raw.length; index += 1) {
    for (let cursor = 0; cursor < raw.length; cursor += 1) {
      if (bytes[index + cursor] !== raw[cursor]) continue outer;
    }
    return index;
  }
  return -1;
}
