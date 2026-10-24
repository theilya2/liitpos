import { createServerFn } from "@tanstack/react-start";
import type { PublicCreditView } from "@/lib/pos/credits";
import { isReceiptToken } from "@/lib/pos/receipt-link";

export const getPublicCredit = createServerFn({ method: "GET" })
  .validator((token: unknown) => (typeof token === "string" ? token.slice(0, 80) : ""))
  .handler(async ({ data }): Promise<{ credit: PublicCreditView | null }> => {
    if (!isReceiptToken(data)) return { credit: null };
    try {
      const { findCreditByToken } = await import("./public-credit.server");
      return { credit: await findCreditByToken(data) };
    } catch (error) {
      console.error("[public-credit]", error instanceof Error ? error.name : "failed");
      return { credit: null };
    }
  });
