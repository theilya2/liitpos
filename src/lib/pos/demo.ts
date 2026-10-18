/** Seeded register and kiosk. Real businesses created later are not in this set. */
const DEMO_IDS = new Set(["store-main", "store-kiosk"]);
const DEMO_CODES = new Set(["100001", "200002"]);

export function isDemoMode(): boolean {
  const env = (import.meta as { env?: { VITE_DEMO_MODE?: string } }).env;
  const value = env?.VITE_DEMO_MODE ?? "";
  return value === "1" || value === "true";
}

export function isDemoBusiness(id: string | null | undefined, code?: string | null): boolean {
  if (id && DEMO_IDS.has(id)) return true;
  if (code && DEMO_CODES.has(code)) return true;
  return false;
}

/** Demo stores and their printed codes work only when VITE_DEMO_MODE is on. */
export function canUseBusiness(id: string | null | undefined, code?: string | null): boolean {
  if (!isDemoBusiness(id, code)) return true;
  return isDemoMode();
}
