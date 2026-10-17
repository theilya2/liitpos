import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { receiptPlainText } from "@/components/pos/receipt";
import { pulseCashDrawer } from "@/lib/pos/drawer";
import {
  buildReceiptJob,
  jpegToPdf,
  normalizePrintSettings,
  receiptPrintLines,
  saleHasCash,
  testSale,
  type PrintLine,
  type ReceiptJob,
  type UsbPrinterInfo,
} from "@/lib/pos/printer";
import {
  hasUsbPrint,
  isNativeApp,
  listUsbPrintersRaw,
  printReceiptUsb,
  pulseDrawerUsb,
  requestUsbPermission,
  shareCachedFile,
} from "@/lib/pos/native";
import { usePos } from "@/lib/pos/store";
import type { Sale } from "@/lib/pos/types";

const started = new Set<string>();

type PrintDetail = { id?: string; status?: string; reason?: string };
type DrawerDetail = { id?: string; status?: string };
type UsbDetail = { deviceName?: string; granted?: boolean };

function bridgeDetail<T>(name: string, matches: (detail: T) => boolean, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener(name, onEvent);
      resolve(null);
    }, timeoutMs);
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<T>).detail;
      if (!matches(detail)) return;
      window.clearTimeout(timer);
      window.removeEventListener(name, onEvent);
      resolve(detail);
    };
    window.addEventListener(name, onEvent);
  });
}

export function readUsbPrinters(): UsbPrinterInfo[] {
  if (!hasUsbPrint()) return [];
  try {
    const parsed = JSON.parse(listUsbPrintersRaw() || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Partial<UsbPrinterInfo>;
      if (typeof raw.deviceName !== "string" || !raw.deviceName) return [];
      return [
        {
          name: typeof raw.name === "string" ? raw.name : "",
          deviceName: raw.deviceName,
          vendorId: Number(raw.vendorId) || 0,
          productId: Number(raw.productId) || 0,
          printer: raw.printer === true,
          hasPermission: raw.hasPermission === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function askUsbPermission(deviceName: string): Promise<boolean> {
  if (!hasUsbPrint() || !deviceName) return Promise.resolve(false);
  const pending = bridgeDetail<UsbDetail>("liitpos-usb", (detail) => detail?.deviceName === deviceName, 60_000);
  requestUsbPermission(deviceName);
  return pending.then((detail) => detail?.granted === true);
}

async function sendUsb(job: ReceiptJob): Promise<"usb" | "fallback"> {
  if (!hasUsbPrint()) return "fallback";
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pending = bridgeDetail<PrintDetail>("liitpos-print", (detail) => detail?.id === id, 50_000);
  printReceiptUsb(JSON.stringify({ ...job, id }));
  const detail = await pending;
  return detail?.status === "usb" ? "usb" : "fallback";
}

async function waitForPaint(): Promise<void> {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 40)));
  });
}

export async function pulseDrawer(): Promise<"sent" | "unavailable"> {
  if (hasUsbPrint()) {
    const prefs = normalizePrintSettings(usePos.getState().settings);
    const id = `d${Date.now().toString(36)}`;
    const pending = bridgeDetail<DrawerDetail>("liitpos-drawer", (detail) => detail?.id === id, 20_000);
    pulseDrawerUsb(JSON.stringify({ id, printerName: prefs.printerName }));
    const detail = await pending;
    if (detail?.status === "sent") return "sent";
  }
  return pulseCashDrawer();
}

/** Print one receipt. USB named Default, then the first USB printer, then the system dialog. */
export async function deliverPrint(sale: Sale, options: { kick?: boolean } = {}): Promise<"usb" | "system"> {
  const settings = usePos.getState().settings;
  const kick = options.kick === true;
  usePos.getState().queuePrint(sale);
  const usb = await sendUsb(buildReceiptJob(sale, settings, kick));
  if (usb === "usb") return "usb";
  if (kick) await pulseDrawer();
  await waitForPaint();
  window.print();
  return "system";
}

export async function printTestReceipt(): Promise<"usb" | "system"> {
  return deliverPrint(testSale(usePos.getState().settings), { kick: false });
}

/**
 * After a confirmed payment: log the drawer, print when auto-print is on,
 * and kick the drawer on cash. Runs once per sale.
 */
export function confirmReceipt(sale: Sale): Promise<void> {
  if (started.has(sale.id)) return Promise.resolve();
  started.add(sale.id);
  const settings = normalizePrintSettings(usePos.getState().settings);
  const cash = saleHasCash(sale);
  if (cash && settings.openDrawer) usePos.getState().openDrawer();
  if (settings.autoPrint) return deliverPrint(sale, { kick: cash && settings.openDrawer }).then(() => undefined);
  if (cash && settings.openDrawer) return pulseDrawer().then(() => undefined);
  return Promise.resolve();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string) {
  const copy = new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function renderReceiptJpeg(sale: Sale): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const printLines = receiptPrintLines(sale);
  const width = 576;
  const pad = 28;
  const rowHeight = (line: PrintLine) => (line.size === "lg" ? 52 : line.size === "sm" ? 34 : 42);
  const height = pad * 2 + printLines.reduce((sum, line) => sum + rowHeight(line), 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(height, 120);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a1a";
  let y = pad;
  for (const line of printLines) {
    const size = line.size === "lg" ? 36 : line.size === "sm" ? 22 : 28;
    ctx.font = `${line.bold ? "700" : "400"} ${size}px Rubik, sans-serif`;
    const baseline = y + size;
    if (line.align === "split") {
      const [label, value] = line.text.split("\t");
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillText(label ?? "", width - pad, baseline);
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.fillText(value ?? "", pad, baseline);
    } else if (line.align === "center") {
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.fillText(line.text, width / 2, baseline);
    } else {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillText(line.text, width - pad, baseline);
    }
    y += rowHeight(line);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("jpeg"))), "image/jpeg", 0.86);
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

function cancelled(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel/i.test(message);
}

async function writeCache(name: string, bytes: Uint8Array): Promise<string> {
  await Filesystem.writeFile({
    path: name,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
  });
  const file = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  return file.uri;
}

export type ShareResult = "shared" | "saved" | "cancelled";

/** Share a receipt image, a one-page PDF, and the plain text. All of it is created on the device. */
export async function shareReceipt(sale: Sale): Promise<ShareResult> {
  const text = receiptPlainText(sale);
  const title = sale.kind === "credit" ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`;
  const image = await renderReceiptJpeg(sale);
  const pdf = jpegToPdf(image.bytes, image.width, image.height);
  const pdfName = `receipt-${sale.number}.pdf`;
  const imageName = `receipt-${sale.number}.jpg`;

  if (isNativeApp()) {
    try {
      const pdfUri = await writeCache(pdfName, pdf);
      const imageUri = await writeCache(imageName, image.bytes);
      await Share.share({
        title,
        text,
        files: [pdfUri, imageUri],
        dialogTitle: "שליחת קבלה",
      });
      return "shared";
    } catch (error) {
      if (cancelled(error)) return "cancelled";
      try {
        shareCachedFile(pdfName, bytesToBase64(pdf), "application/pdf", text, title);
        return "shared";
      } catch (nativeError) {
        if (cancelled(nativeError)) return "cancelled";
      }
    }
  }

  const file = new File([new Uint8Array(pdf)], pdfName, { type: "application/pdf" });
  const imageFile = new File([new Uint8Array(image.bytes)], imageName, { type: "image/jpeg" });
  try {
    if (navigator.canShare?.({ files: [file, imageFile] })) {
      await navigator.share({ title, text, files: [file, imageFile] });
      return "shared";
    }
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      downloadBytes(pdf, pdfName, "application/pdf");
      return "shared";
    }
  } catch (error) {
    if (cancelled(error)) return "cancelled";
  }
  downloadBytes(pdf, pdfName, "application/pdf");
  downloadBytes(image.bytes, imageName, "image/jpeg");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* the files are already saved */
  }
  return "saved";
}

export function shareStatus(result: ShareResult): string {
  if (result === "shared") return "נשלח";
  if (result === "saved") return "הקבלה נשמרה";
  return "בוטל";
}
