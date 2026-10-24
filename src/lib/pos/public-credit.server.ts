import { toPublicCredit, type PublicCreditView } from "@/lib/pos/credits";
import { getSql } from "@/lib/db";
import { isReceiptToken } from "@/lib/pos/receipt-link";

export async function findCreditByToken(token: string): Promise<PublicCreditView | null> {
  if (!isReceiptToken(token)) return null;
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`
    select doc::text as doc
    from pos_docs
    where kind = 'credit' and deleted = false and doc->>'token' = ${token}
    limit 1
  `;
  const raw = rows[0]?.doc;
  if (!raw) return null;
  try {
    return toPublicCredit(JSON.parse(raw));
  } catch {
    return null;
  }
}
