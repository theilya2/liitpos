import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { ReceiptView } from "@/components/pos/receipt";
import { SendReceipt } from "@/components/pos/send-sms";
import { PageHeader } from "@/components/pos/shell";
import { can } from "@/lib/pos/access";
import { Numpad } from "@/components/pos/numpad";
import { formatILS, formatDay, moneyFromPad, pushMoneyKey, roundCash, roundMoney } from "@/lib/pos/money";
import { confirmReceipt, deliverPrint } from "@/lib/pos/receipt-io";
import { currentUser, usePos } from "@/lib/pos/store";
import { foldTenders, isCredit, methodSummary, previewTender, quoteRefund, refundedQty, refundMethodsFor, type TenderInput } from "@/lib/pos/tender";
import { type PaymentMethod, type Sale } from "@/lib/pos/types";

function RefundPanel({ sale, sales, onClose }: { sale: Sale; sales: Sale[]; onClose: (note: Sale | null) => void }) {
  const refundSale = usePos((state) => state.refundSale);
  const [qty, setQty] = useState<number[]>(() => sale.lines.map(() => 0));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [inputs, setInputs] = useState<TenderInput[]>([]);
  const [pad, setPad] = useState("");
  const [error, setError] = useState("");
  const picks = qty.map((count, index) => ({ index, qty: count })).filter((pick) => pick.qty > 0);
  const quote = quoteRefund(sale, sales, picks);
  const methods = refundMethodsFor(sale);
  const folded = quote ? foldTenders(quote.total, inputs) : null;
  const taken = folded?.tenders ?? [];
  const remaining = quote ? (folded?.remaining ?? quote.total) : 0;
  const slice = pad === "" ? (method === "cash" ? roundCash(remaining) : remaining) : moneyFromPad(pad);
  const draft = remaining > 0.001 ? previewTender(remaining, { method, tendered: slice }) : null;
  const draftCloses = Boolean(quote && draft && foldTenders(quote.total, [...inputs, { method, tendered: slice }])?.remaining === 0);

  function changeQty(index: number, next: number) {
    setQty((current) => current.map((value, i) => (i === index ? next : value)));
    setInputs([]);
    setPad("");
    setError("");
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <h2 className="text-base font-semibold">תעודת זיכוי לקבלה {sale.number}</h2>
      <ul className="space-y-2">
        {sale.lines.map((line, index) => {
          const left = roundMoney(line.qty - refundedQty(sale.id, sales, index));
          return (
            <li key={`${line.name}-${index}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">
                {line.name}
                <span className="block text-xs text-muted">נותר {left}</span>
              </span>
              <button type="button" aria-label="הפחתה" disabled={qty[index] <= 0} onClick={() => changeQty(index, Math.max(0, qty[index] - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-paper text-lg ring-1 ring-line disabled:opacity-40">
                −
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{qty[index]}</span>
              <button type="button" aria-label="הוספה" disabled={qty[index] >= left} onClick={() => changeQty(index, Math.min(left, qty[index] + 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-paper text-lg ring-1 ring-line disabled:opacity-40">
                +
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-lg font-semibold tabular-nums">{quote ? `יתרה ${formatILS(remaining)}` : "בחרו פריטים"}</p>
      {taken.length ? (
        <ul className="space-y-2">
          {taken.map((line, index) => (
            <li key={`${line.method}-${index}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">{METHOD_LABEL_SAFE(line.method)}</span>
              <span className="font-semibold tabular-nums">{formatILS(line.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {remaining > 0.001 ? (
        <div className="grid grid-cols-2 gap-2">
          {methods.map((item) => (
            <button key={item} type="button" onClick={() => setMethod(item)} className={`h-12 rounded-xl text-sm font-semibold ${method === item ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
              {item === "voucher" ? "שובר זיכוי" : METHOD_LABEL_SAFE(item)}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-sm text-copper">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onClose(null)} className="h-12 rounded-xl bg-paper text-sm ring-1 ring-line">
          ביטול
        </button>
        <button
          type="button"
          disabled={!quote || (remaining > 0.001 && !draftCloses)}
          onClick={() => {
            if (!quote) return;
            const tenders = remaining <= 0.001 ? inputs : [...inputs, { method, tendered: slice }];
            const note = refundSale({ saleId: sale.id, lines: picks, tenders });
            if (!note) {
              setError("אי אפשר להוציא זיכוי על הכמות הזו.");
              return;
            }
            onClose(note);
          }}
          className="h-12 rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-40"
        >
          הפקת זיכוי
        </button>
      </div>
      {remaining > 0.001 && quote ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-muted">
            {pad === "" ? `הסכום הריק מחזיר את כל היתרה, ${formatILS(slice)}.` : `סכום להחזרה ${formatILS(slice)}`}
            {method === "cash" && (draft?.change ?? 0) > 0 ? ` · עודף ${formatILS(draft?.change ?? 0)}` : ""}
          </p>
          <Numpad onKey={(key) => setPad((current) => pushMoneyKey(current, key))} />
          <button
            type="button"
            disabled={!draft || draftCloses}
            onClick={() => {
              const next = [...inputs, { method, tendered: slice }];
              if (!quote || !foldTenders(quote.total, next) || foldTenders(quote.total, next)?.remaining === 0) {
                setError("כדי לחלק, רושמים סכום קטן מהיתרה.");
                return;
              }
              setInputs(next);
              setPad("");
              setError("");
            }}
            className="h-12 w-full rounded-xl bg-paper text-sm font-semibold ring-1 ring-line disabled:opacity-40"
          >
            הוספת {METHOD_LABEL_SAFE(method)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function METHOD_LABEL_SAFE(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    cash: "מזומן",
    card: "אשראי",
    club: "כרטיס מועדון",
    bit: "ביט",
    paybox: "פייבוקס",
    transfer: "העברה",
    voucher: "שובר",
  };
  return labels[method];
}

export function ReceiptsPage() {
  const sales = usePos((state) => state.sales);
  const voidSale = usePos((state) => state.voidSale);
  const user = usePos(currentUser);
  const mayVoid = !!user && can(user.role, "void");
  const mayRefund = !!user && can(user.role, "refund");
  const [refunding, setRefunding] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

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

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col">
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
        <div className={`scroll-pane min-h-0 flex-1 px-3 pb-4 ${selected ? "hidden lg:block" : ""}`}>
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
                      setRefunding(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start ring-1 ring-line ${selectedId === sale.id ? "bg-pine-soft" : "bg-surface"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block font-medium ${sale.voided ? "text-muted line-through" : ""}`}>{isCredit(sale) ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`}</span>
                      <span className="text-sm text-muted">
                        {formatDay(sale.createdAt)} · {methodSummary(sale)}
                        {sale.cashierName ? ` · ${sale.cashierName}` : ""}
                        {sale.voided ? " · מבוטלת" : ""}
                        {sale.zId ? " · Z" : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${sale.voided ? "text-muted" : ""}`}>{isCredit(sale) ? `−${formatILS(sale.amountDue)}` : formatILS(sale.amountDue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`scroll-pane min-h-0 w-full border-line px-3 pb-4 lg:w-[min(36rem,42%)] lg:border-s ${selected ? "" : "hidden lg:block"}`}>
          {selected ? (
            <div>
              <button type="button" onClick={() => setSelectedId(null)} className="mb-3 min-h-12 rounded-xl bg-surface px-4 text-sm lg:hidden">
                חזרה לרשימה
              </button>
              <div className="mx-auto w-full max-w-sm">
              <ReceiptView sale={selected} />
              <button
                type="button"
                onClick={() => void deliverPrint(selected)}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface px-3 py-2 text-sm font-medium ring-1 ring-line"
              >
                <Printer className="size-4 shrink-0" />
                הדפסה
              </button>
              <SendReceipt sale={selected} />
              {selected.voided || isCredit(selected) ? null : mayRefund ? (
                refunding ? (
                  <RefundPanel
                    sale={selected}
                    sales={sales}
                    onClose={(note) => {
                      setRefunding(false);
                      if (note) void confirmReceipt(note);
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => setRefunding(true)} className="mt-3 min-h-12 w-full rounded-2xl bg-surface px-3 text-sm font-semibold ring-1 ring-line">
                    זיכוי חלקי
                  </button>
                )
              ) : null}
              {selected.voided || isCredit(selected) ? null : selected.zId ? (
                <p className="mt-3 text-center text-sm text-muted">הקבלה נסגרה בדוח Z ולא ניתנת לביטול. זיכוי עדיין אפשר.</p>
              ) : sales.some((item) => item.kind === "credit" && !item.voided && item.creditOfId === selected.id) ? (
                <p className="mt-3 text-center text-sm text-muted">יש כבר זיכוי על הקבלה הזו, אז אי אפשר לבטל אותה כולה.</p>
              ) : mayVoid ? (
                confirmVoid ? (
                <div className="mt-3 rounded-2xl bg-copper-soft p-3">
                  <p className="text-sm">לבטל את קבלה {selected.number}? היא תישאר בהיסטוריה אבל לא תיכלל בדוח.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmVoid(false)} className="h-12 rounded-xl bg-surface text-sm">
                      השארה
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        voidSale(selected.id);
                        setConfirmVoid(false);
                      }}
                      className="h-12 rounded-xl bg-copper text-sm font-semibold text-pine-ink"
                    >
                      ביטול קבלה
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmVoid(true)} className="mt-3 min-h-12 w-full rounded-2xl px-3 text-sm font-medium text-copper">
                  ביטול קבלה
                </button>
              )
              ) : null}
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">בחרו קבלה כדי לראות פירוט.</p>
          )}
        </div>
      </div>
    </div>
  );
}
