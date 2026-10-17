import { roundMoney } from "@/lib/pos/money";
import type { TerminalEndpoint, TerminalKind } from "@/lib/pos/types";

export const MAX_PAYMENTS = 12;

const BLOCKED = new Set(["0.0.0.0", "255.255.255.255", "169.254.169.254"]);

export function isSafeIpv4(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  if (BLOCKED.has(ip)) return false;
  return ip.split(".").every((part) => {
    const n = Number(part);
    return part === String(n) && n <= 255;
  });
}

export function cleanEndpoint(value: unknown, fallback: TerminalEndpoint): TerminalEndpoint {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as { ip?: unknown; port?: unknown; https?: unknown };
  const ip = typeof raw.ip === "string" ? raw.ip.trim().slice(0, 15) : "";
  const port = Number(raw.port);
  return {
    ip: ip === "" || isSafeIpv4(ip) ? ip : fallback.ip,
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback.port,
    https: raw.https === true,
  };
}

export function terminalOrigin(endpoint: TerminalEndpoint): string | null {
  if (!isSafeIpv4(endpoint.ip)) return null;
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) return null;
  return `${endpoint.https ? "https" : "http"}://${endpoint.ip}:${endpoint.port}`;
}

export function paymentPlan(total: number, count: number): { count: number; first: number; rest: number } {
  const n = Math.min(MAX_PAYMENTS, Math.max(1, Math.round(count)));
  const cents = Math.round(roundMoney(total) * 100);
  const rest = Math.floor(cents / n);
  const first = cents - rest * (n - 1);
  return { count: n, first: first / 100, rest: rest / 100 };
}

export function deviceLabel(kind: TerminalKind): string {
  return kind === "android" ? "מסופון אנדרואיד" : "פינפד";
}

export type ChargeOk = { ok: true; auth: string; last4: string; brand: string };
export type ChargeFail = { ok: false; message: string };
export type ChargeResult = ChargeOk | ChargeFail;

function textOf(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function failMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "ההמתנה למסוף בוטלה.";
  return "אין תשובה מהמסוף. בודקים שהמכשיר דולק, שהכתובת זהה בשני הצדדים, ושהוא מרשה לקופה לקרוא את התשובה.";
}

export async function chargeTerminal(input: {
  endpoint: TerminalEndpoint;
  amount: number;
  payments: number;
  method: "credit" | "club";
  receipt: number;
  signal: AbortSignal;
}): Promise<ChargeResult> {
  const origin = terminalOrigin(input.endpoint);
  if (!origin) return { ok: false, message: "כתובת המסוף לא תקינה." };
  const timeout = AbortSignal.timeout(50_000);
  const signal = AbortSignal.any([input.signal, timeout]);
  try {
    const response = await fetch(`${origin}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        amount: roundMoney(input.amount),
        currency: "ILS",
        payments: input.payments,
        method: input.method,
        receipt: input.receipt,
      }),
      signal,
    });
    const data = (await response.json()) as { approved?: unknown; auth?: unknown; approval?: unknown; last4?: unknown; brand?: unknown; message?: unknown };
    if (data?.approved === true) {
      const last4 = textOf(data.last4, 8).replace(/\D/g, "").slice(-4);
      return { ok: true, auth: textOf(data.auth, 16) || textOf(data.approval, 16), last4, brand: textOf(data.brand, 24) };
    }
    return { ok: false, message: textOf(data?.message, 80) || (response.ok ? "המסוף דחה את העסקה." : "המסוף לא אישר את החיוב.") };
  } catch (error) {
    if (timeout.aborted && !input.signal.aborted) return { ok: false, message: "המסוף לא ענה בזמן. אם יצא פתק אישור, רושמים את המספר ידנית." };
    return { ok: false, message: failMessage(error) };
  }
}

export async function pingTerminal(endpoint: TerminalEndpoint): Promise<{ ok: boolean; message: string }> {
  const origin = terminalOrigin(endpoint);
  if (!origin) return { ok: false, message: "מזינים כתובת IP תקינה לפני הבדיקה." };
  try {
    const response = await fetch(`${origin}/health`, { method: "GET", signal: AbortSignal.timeout(4_000) });
    if (response.ok) return { ok: true, message: "המסוף ענה." };
    return { ok: false, message: "המסוף ענה, אבל הבדיקה לא הצליחה." };
  } catch {
    return { ok: false, message: "אין תשובה. בודקים IP, פורט, ושהמכשיר באותה רשת." };
  }
}
