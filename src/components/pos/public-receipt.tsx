import { ReceiptView } from "@/components/pos/receipt";
import type { Sale } from "@/lib/pos/types";

export function PublicReceipt({ sale }: { sale: Sale | null }) {
  if (!sale) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
        <h1 className="text-2xl font-semibold">הקבלה עדיין לא כאן</h1>
        <p className="mt-3 text-sm text-pretty text-muted">
          אם שילמתם עכשיו, הקבלה המלאה תופיע אחרי שהקופה תתחבר לרשת. אפשר לשמור את הקישור ולפתוח אותו שוב.
        </p>
      </main>
    );
  }
  const title = sale.kind === "credit" ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-3 py-6">
      <h1 className="sr-only">{title}</h1>
      <ReceiptView sale={sale} />
    </main>
  );
}
