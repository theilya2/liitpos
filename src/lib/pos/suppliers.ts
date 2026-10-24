import type { Supplier } from "@/lib/pos/types";

export const EMPTY_SUPPLIERS: Supplier[] = [];

export function selectSuppliers(suppliers: Supplier[] | undefined): Supplier[] {
  return suppliers ?? EMPTY_SUPPLIERS;
}

export function cleanSuppliers(value: unknown): Supplier[] {
  if (!Array.isArray(value)) return [];
  const suppliers: Supplier[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Supplier>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
    const id = typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : "";
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    suppliers.push({ id, name });
    if (suppliers.length >= 80) break;
  }
  return suppliers;
}
