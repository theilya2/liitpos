import { roundMoney } from "@/lib/pos/money";
import type { StoreCredit, StoreCreditRedemption } from "@/lib/pos/types";

const EMPTY_CREDITS: StoreCredit[] = [];
const YEAR_MS = 365 * 24 * 3_600_000;

export function selectCredits(credits: StoreCredit[] | null | undefined): StoreCredit[] {
  return credits ?? EMPTY_CREDITS;
}

export function normalizeCreditCode(raw: string): string {
  return raw.replace(/\*/g, "").replace(/\s/g, "").toUpperCase();
}

export function newCreditCode(existing: string[]): string {
  const used = new Set(existing.map((code) => normalizeCreditCode(code)));
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const code = `Z${Math.floor(100000 + Math.random() * 900000)}`;
    if (!used.has(code)) return code;
  }
  return `Z${String(Date.now()).slice(-6)}`;
}

export function creditUrl(token: string): string {
  return `https://liitpos.vercel.app/c/${token}`;
}

export function creditCloudId(businessId: string, creditId: string): string {
  return `credit:${businessId}:${creditId}`;
}

export function punchCloudId(businessId: string, punchId: string): string {
  return `punch:${businessId}:${punchId}`;
}

export function creditSmsBody(credit: Pick<StoreCredit, "number" | "balance" | "expiresAt" | "businessName">, url: string | null): string {
  const lines = [
    credit.businessName,
    `שובר זיכוי ${credit.number}`,
    `יתרה ${credit.balance.toFixed(2)} ₪`,
    `בתוקף עד ${credit.expiresAt.slice(0, 10)}`,
  ];
  if (url) lines.push(url);
  return lines.filter((line) => line.trim()).join("\n");
}

type TenderLike = { method: string; amount?: number; tendered?: number; voucherCode?: string };

function tenderAmount(line: TenderLike): number {
  const amount = Number(line.amount ?? line.tendered);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

export function issueCreditsForTenders(input: {
  tenders: TenderLike[];
  at: string;
  saleId: string;
  saleNumber: number;
  registerNo: number | null;
  registerName: string;
  businessName: string;
  token: () => string;
  id: () => string;
}): StoreCredit[] {
  const issuedAt = Number.isFinite(Date.parse(input.at)) ? new Date(input.at).toISOString() : new Date().toISOString();
  const expiresAt = new Date(Date.parse(issuedAt) + YEAR_MS).toISOString();
  const credits: StoreCredit[] = [];
  for (const line of input.tenders) {
    if (line.method !== "voucher") continue;
    const amount = tenderAmount(line);
    const number = normalizeCreditCode(line.voucherCode ?? "");
    if (!number || amount <= 0) continue;
    credits.push({
      id: input.id(),
      number,
      token: input.token(),
      issuedAt,
      expiresAt,
      original: amount,
      balance: amount,
      saleId: input.saleId,
      saleNumber: input.saleNumber,
      voided: false,
      redemptions: [],
      registerNo: input.registerNo,
      registerName: input.registerName,
      businessName: input.businessName.slice(0, 40),
    });
  }
  return credits;
}

function usable(credit: StoreCredit, now: number): string | null {
  if (credit.voided) return `שובר ${credit.number} בוטל`;
  if (Date.parse(credit.expiresAt) <= now) return `שובר ${credit.number} פג תוקף`;
  if (credit.balance <= 0.001) return `שובר ${credit.number} מומש`;
  return null;
}

export function findCredit(credits: StoreCredit[], raw: string): StoreCredit | null {
  const code = normalizeCreditCode(raw);
  if (!code) return null;
  return credits.find((credit) => credit.number === code) ?? null;
}

/** Null when the scan is not a known voucher, so the register can keep looking for a product. */
export function lookupCredit(credits: StoreCredit[], raw: string, now: number): { credit: StoreCredit | null; blocked: string | null } {
  const credit = findCredit(credits, raw);
  if (!credit) return { credit: null, blocked: null };
  return { credit, blocked: usable(credit, now) };
}

export function redeemCredits(
  credits: StoreCredit[],
  tenders: TenderLike[],
  meta: { at: string; saleId: string; saleNumber: number; registerNo: number | null },
  now = Date.parse(meta.at),
): { ok: true; credits: StoreCredit[] } | { ok: false; message: string } {
  const wanted = new Map<string, number>();
  for (const line of tenders) {
    if (line.method !== "voucher") continue;
    const code = normalizeCreditCode(line.voucherCode ?? "");
    if (!code || !credits.some((credit) => credit.number === code)) continue;
    const amount = tenderAmount(line);
    if (amount <= 0) continue;
    wanted.set(code, roundMoney((wanted.get(code) ?? 0) + amount));
  }
  if (!wanted.size) return { ok: true, credits };
  for (const [code, amount] of wanted) {
    const credit = credits.find((item) => item.number === code);
    if (!credit) continue;
    const problem = usable(credit, now);
    if (problem) return { ok: false, message: problem };
    if (amount > credit.balance + 0.001) return { ok: false, message: `בשובר ${code} נשארו ${credit.balance.toFixed(2)} ₪` };
  }
  const next = credits.map((credit) => {
    const amount = wanted.get(credit.number);
    if (!amount) return credit;
    const redemption: StoreCreditRedemption = {
      at: meta.at,
      amount,
      saleId: meta.saleId,
      saleNumber: meta.saleNumber,
      registerNo: meta.registerNo,
    };
    return { ...credit, balance: roundMoney(credit.balance - amount), redemptions: [...credit.redemptions, redemption] };
  });
  return { ok: true, credits: next };
}

export function creditBlocker(credits: StoreCredit[], tenders: TenderLike[], now: number): string | null {
  const result = redeemCredits(credits, tenders, { at: new Date(now).toISOString(), saleId: "_", saleNumber: 0, registerNo: null }, now);
  return result.ok ? null : result.message;
}

export function cleanCredit(value: unknown): StoreCredit | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StoreCredit>;
  if (typeof raw.id !== "string" || typeof raw.number !== "string" || typeof raw.token !== "string") return null;
  const original = Number(raw.original);
  const balance = Number(raw.balance);
  if (!Number.isFinite(original) || !Number.isFinite(balance)) return null;
  const redemptions: StoreCreditRedemption[] = [];
  if (Array.isArray(raw.redemptions)) {
    for (const item of raw.redemptions) {
      if (!item || typeof item !== "object") continue;
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || typeof item.at !== "string") continue;
      redemptions.push({
        at: item.at,
        amount: roundMoney(amount),
        saleId: typeof item.saleId === "string" ? item.saleId.slice(0, 80) : "",
        saleNumber: Number(item.saleNumber) || 0,
        registerNo: typeof item.registerNo === "number" ? item.registerNo : null,
      });
      if (redemptions.length >= 40) break;
    }
  }
  return {
    id: raw.id.slice(0, 80),
    number: normalizeCreditCode(raw.number).slice(0, 12),
    token: raw.token.slice(0, 80),
    issuedAt: typeof raw.issuedAt === "string" ? raw.issuedAt : new Date(0).toISOString(),
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : new Date(0).toISOString(),
    original: roundMoney(original),
    balance: roundMoney(Math.max(0, balance)),
    saleId: typeof raw.saleId === "string" ? raw.saleId : "",
    saleNumber: Number(raw.saleNumber) || 0,
    voided: raw.voided === true,
    redemptions,
    registerNo: typeof raw.registerNo === "number" ? raw.registerNo : null,
    registerName: typeof raw.registerName === "string" ? raw.registerName.slice(0, 40) : "",
    businessName: typeof raw.businessName === "string" ? raw.businessName.slice(0, 40) : "",
  };
}

export function cleanCredits(value: unknown): StoreCredit[] {
  if (!Array.isArray(value)) return [];
  const credits: StoreCredit[] = [];
  for (const item of value) {
    const credit = cleanCredit(item);
    if (credit) credits.push(credit);
    if (credits.length >= 2000) break;
  }
  return credits;
}

export function creditSyncMark(credit: StoreCredit): string {
  return `${credit.balance}:${credit.voided}:${credit.redemptions.length}`;
}

export type PublicCreditView = {
  number: string;
  original: number;
  balance: number;
  issuedAt: string;
  expiresAt: string;
  voided: boolean;
  businessName: string;
  expired: boolean;
};

export function toPublicCredit(value: unknown, now = Date.now()): PublicCreditView | null {
  const credit = cleanCredit(value);
  if (!credit) return null;
  return {
    number: credit.number,
    original: credit.original,
    balance: credit.balance,
    issuedAt: credit.issuedAt,
    expiresAt: credit.expiresAt,
    voided: credit.voided,
    businessName: credit.businessName,
    expired: Date.parse(credit.expiresAt) <= now,
  };
}
