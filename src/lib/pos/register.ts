/** Cloud host baked into the Android app. A pairing link may still override it. */
export const DEFAULT_CLOUD_ORIGIN = "https://liitpos.vercel.app";

export const REVOKED_DETAIL = 'הקופה נותקה ע"י המנהל';

export type RegisterClaim = {
  number: number;
  name: string;
  businessId: string;
};

export type RegisterStamp = {
  registerNo: number;
  registerName: string;
};

export function nextRegisterNo(existing: number[]): number {
  let max = 0;
  for (const value of existing) {
    if (Number.isInteger(value) && value > max) max = value;
  }
  return max + 1;
}

export function cleanBusinessId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 40 || /\s/.test(id)) return null;
  return id;
}

export function cleanRegisterName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

export function registerCaption(no: number | null | undefined, name?: string | null): string {
  if (typeof no !== "number" || !Number.isInteger(no) || no < 1) return "";
  const base = `קופה ${no}`;
  const trimmed = cleanRegisterName(name ?? "");
  return trimmed ? `${base} · ${trimmed}` : base;
}

/** Tag a sale or shift only when this device is the register for the open business. */
export function registerStamp(input: {
  registerNo: number | null;
  registerName: string;
  registerBusinessId: string;
  registerRevoked: boolean;
  activeStoreId: string;
}): RegisterStamp | null {
  if (input.registerRevoked) return null;
  if (typeof input.registerNo !== "number" || !Number.isInteger(input.registerNo) || input.registerNo < 1) return null;
  if (!input.registerBusinessId || input.registerBusinessId !== input.activeStoreId) return null;
  return { registerNo: input.registerNo, registerName: cleanRegisterName(input.registerName) };
}

export function readRegisterClaim(value: unknown): RegisterClaim | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { number?: unknown; name?: unknown; businessId?: unknown };
  const number = Number(raw.number);
  const businessId = cleanBusinessId(raw.businessId);
  if (!Number.isInteger(number) || number < 1 || number > 9999 || !businessId) return null;
  return { number, name: cleanRegisterName(typeof raw.name === "string" ? raw.name : ""), businessId };
}
