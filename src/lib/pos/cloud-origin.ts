/** Public host of the standalone register server. The Vercel site is not this origin. */
export const PRODUCTION_CLOUD_ORIGIN = "https://liitpos.185-250-36-27.sslip.io";

/** Previous production host. A saved copy of this address is retargeted once. */
export const LEGACY_CLOUD_ORIGIN = "https://liitpos.vercel.app";

export const HISTORY_HOLD_KEY = "liitpos-history-hold";
export const MOVED_TO_KEY = "liitpos-moved-to";
export const HELD_OUTBOX_KEY = "liitpos-held-outbox";

export function httpsOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** Join a Liitpos API path to the register server. An empty origin stays relative for the website. */
export function posUrl(path: string, origin: string): string {
  const base = httpsOrigin(origin);
  return base ? `${base}${path}` : path;
}

export type ServerMove<T extends { id: string }> = {
  origin: string;
  moved: boolean;
  token: string;
  outbox: T[];
  held: T[];
  sales: { id: string }[];
  clearCursor: boolean;
  clearRegister: boolean;
  holdHistory: boolean;
};

/**
 * One move from the legacy Vercel host to the standalone server.
 * Sales stay in `sales`. The old device token is dropped. The queued upload is parked, not sent.
 * Any other saved https origin is left alone. A native install with no saved origin uses the new host
 * and does not pretend there was a previous server.
 */
export function planServerMove<T extends { id: string }>(input: {
  native: boolean;
  savedOrigin: string;
  movedTo: string;
  token: string;
  outbox: T[];
  sales: { id: string }[];
}): ServerMove<T> {
  const saved = httpsOrigin(input.savedOrigin);
  const keep = {
    origin: saved,
    moved: false,
    token: input.token,
    outbox: input.outbox,
    held: [] as T[],
    sales: input.sales,
    clearCursor: false,
    clearRegister: false,
    holdHistory: false,
  };
  if (!input.native) return keep;
  if (!saved) return { ...keep, origin: PRODUCTION_CLOUD_ORIGIN };
  if (saved !== LEGACY_CLOUD_ORIGIN || input.movedTo === PRODUCTION_CLOUD_ORIGIN) return { ...keep, origin: saved };
  return {
    origin: PRODUCTION_CLOUD_ORIGIN,
    moved: true,
    token: "",
    outbox: [],
    held: input.outbox,
    sales: input.sales,
    clearCursor: true,
    clearRegister: true,
    holdHistory: true,
  };
}

export function historyHeld(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HISTORY_HOLD_KEY) === "1";
  } catch {
    return false;
  }
}
