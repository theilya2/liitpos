import { getSql } from "@/lib/db";
import { isReceiptToken, toPublicSale } from "@/lib/pos/receipt-link";
import type { Sale } from "@/lib/pos/types";

export async function findReceiptByToken(token: string): Promise<Sale | null> {
  if (!isReceiptToken(token)) return null;
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`
    select doc::text as doc
    from pos_docs
    where kind = 'sale' and deleted = false and doc->>'publicToken' = ${token}
    limit 1
  `;
  const raw = rows[0]?.doc;
  if (!raw) return null;
  try {
    return toPublicSale(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}
