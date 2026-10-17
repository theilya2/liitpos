import { createServerFn } from "@tanstack/react-start";
import { isReceiptToken } from "@/lib/pos/receipt-link";
import type { Sale } from "@/lib/pos/types";

export const getPublicReceipt = createServerFn({ method: "GET" })
  .validator((token: unknown) => (typeof token === "string" ? token.slice(0, 80) : ""))
  .handler(async ({ data }): Promise<{ sale: Sale | null }> => {
    if (!isReceiptToken(data)) return { sale: null };
    try {
      const { findReceiptByToken } = await import("./public-receipt.server");
      return { sale: await findReceiptByToken(data) };
    } catch (error) {
      console.error("[public-receipt]", error instanceof Error ? error.name : "failed");
      return { sale: null };
    }
  });
