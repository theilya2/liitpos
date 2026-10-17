import { useEffect, useMemo, useState } from "react";
import { Printer, Share2 } from "lucide-react";
import { ReceiptView, receiptPlainText } from "@/components/pos/receipt";
import { PageHeader } from "@/components/pos/shell";
import { can } from "@/lib/pos/access";
import { formatILS, formatDay } from "@/lib/pos/money";
import { currentUser, usePos } from "@/lib/pos/store";
import { METHOD_LABEL } from "@/lib/pos/types";

export function ReceiptsPage() {
  const sales = usePos((state) => state.sales);
  const voidSale = usePos((state) => state.voidSale);
  const queuePrint = usePos((state) => state.queuePrint);
  const user = usePos(currentUser);
  const mayVoid = !!user && can(user.role, "void");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [shared, setShared] = useState("");

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return sales;
    return sales.filter((sale) => String(sale.number).includes(q) || sale.lines.some((line) => line.name.includes(q)));
  }, [sales, query]);

  const selected = sales.find((sale) => sale.id === selectedId) ?? null;

  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (!selectedId && sales[0]) setSelectedId(sales[0].id);
  }, [sales, selectedId]);

  async function share() {
    if (!selected) return;
    const text = receiptPlainText(selected);
    try {
      if (navigator.share) {
        await navigator.share({ title: `קבלה ${selected.number}`, text });
        setShared("נשלח");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared("הועתק");
    } catch {
      setShared("בוטל");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="קבלות" subtitle="היסטוריית המכירות שנשמרה במכשיר." />
      <div className="shrink-0 px-3 pb-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="מספר קבלה או שם מוצר"
          aria-label="חיפוש קבלה"
          className="h-12 w-full rounded-2xl bg-surface px-3 ring-1 ring-line"
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={`min-h-0 flex-1 overflow-y-auto px-3 pb-4 ${selected ? "hidden lg:block" : ""}`}>
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">אין קבלות להצגה.</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((sale) => (
                <li key={sale.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(sale.id);
                      setConfirmVoid(false);
                      setShared("");
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start ring-1 ring-line ${selectedId === sale.id ? "bg-pine-soft" : "bg-surface"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block font-medium ${sale.voided ? "text-muted line-through" : ""}`}>קבלה {sale.number}</span>
                      <span className="text-sm text-muted">
                        {formatDay(sale.createdAt)} · {METHOD_LABEL[sale.method]}
                        {sale.cashierName ? ` · ${sale.cashierName}` : ""}
                        {sale.voided ? " · מבוטלת" : ""}
                        {sale.zId ? " · Z" : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${sale.voided ? "text-muted" : ""}`}>{formatILS(sale.amountDue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`min-h-0 w-full overflow-y-auto border-line px-3 pb-4 lg:w-96 lg:border-s ${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <div>
              <button type="button" onClick={() => setSelectedId(null)} className="mb-3 h-11 rounded-xl bg-surface px-4 text-sm lg:hidden">
                חזרה לרשימה
              </button>
              <ReceiptView sale={selected} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    queuePrint(selected);
                    requestAnimationFrame(() => window.print());
                  }}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-medium ring-1 ring-line"
                >
                  <Printer className="size-4" />
                  הדפסה
                </button>
                <button type="button" onClick={() => void share()} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-medium ring-1 ring-line">
                  <Share2 className="size-4" />
                  {shared || "שיתוף"}
                </button>
              </div>
              {selected.voided ? null : selected.zId ? (
                <p className="mt-3 text-center text-sm text-muted">הקבלה נסגרה בדוח Z ולא ניתנת לביטול.</p>
              ) : mayVoid ? (
                confirmVoid ? (
                <div className="mt-3 rounded-2xl bg-copper-soft p-3">
                  <p className="text-sm">לבטל את קבלה {selected.number}? היא תישאר בהיסטוריה אבל לא תיכלל בדוח.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmVoid(false)} className="h-11 rounded-xl bg-surface text-sm">
                      השארה
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        voidSale(selected.id);
                        setConfirmVoid(false);
                      }}
                      className="h-11 rounded-xl bg-copper text-sm font-semibold text-pine-ink"
                    >
                      ביטול קבלה
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmVoid(true)} className="mt-3 h-12 w-full rounded-2xl text-sm font-medium text-copper">
                  ביטול קבלה
                </button>
              )
              ) : null}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">בחרו קבלה כדי לראות פירוט.</p>
          )}
        </div>
      </div>
    </div>
  );
}
