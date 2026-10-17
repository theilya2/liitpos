import { useMemo, useState } from "react";
import { PageHeader } from "@/components/pos/shell";
import { formatILS, formatWhen, roundMoney } from "@/lib/pos/money";
import { usePos } from "@/lib/pos/store";
import { STOCK_REASON_LABEL, type StockReason } from "@/lib/pos/types";

export function InventoryPage() {
  const products = usePos((state) => state.products);
  const moves = usePos((state) => state.stockMoves);
  const adjustStock = usePos((state) => state.adjustStock);
  const [lowOnly, setLowOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [mode, setMode] = useState<StockReason>("receive");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const tracked = products.filter((product) => product.trackStock && product.active);
  const stockValue = roundMoney(tracked.reduce((sum, product) => sum + product.stock * product.price, 0));
  const lowCount = tracked.filter((product) => product.stock <= product.lowStock).length;
  const visible = useMemo(() => {
    const q = query.trim();
    return tracked
      .filter((product) => (lowOnly ? product.stock <= product.lowStock : true))
      .filter((product) => !q || product.name.includes(q) || product.sku.includes(q))
      .sort((a, b) => a.stock - b.stock);
  }, [tracked, lowOnly, query]);
  const selected = products.find((product) => product.id === productId) ?? null;

  function apply() {
    if (!selected) return;
    const amount = Number(qty.replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return;
    const delta = mode === "count" ? amount - selected.stock : mode === "waste" ? -Math.abs(amount) : Math.abs(amount);
    adjustStock(selected.id, delta, mode, note);
    setQty("");
    setNote("");
    setProductId(null);
  }

  return (
    <div className="scroll-pane page-sheet min-h-0 flex-1">
      <PageHeader title="מלאי" subtitle="כמות במדף, שווי ופעולות קבלה, ספירה ופחת." />
      <div className="space-y-3 px-3 pb-6">
        <section className="grid grid-cols-3 gap-2">
          <Stat label="פריטים" value={String(tracked.length)} />
          <Stat label="מתחת לסף" value={String(lowCount)} accent={lowCount > 0} />
          <Stat label="שווי מלאי" value={formatILS(stockValue)} />
        </section>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש מוצר"
            aria-label="חיפוש במלאי"
            className="h-12 min-w-0 flex-1 rounded-2xl bg-surface px-3 ring-1 ring-line"
          />
          <button
            type="button"
            onClick={() => setLowOnly((value) => !value)}
            className={`h-12 shrink-0 rounded-2xl px-4 text-sm ${lowOnly ? "bg-copper text-pine-ink" : "bg-surface ring-1 ring-line"}`}
          >
            חוסרים
          </button>
        </div>
        <ul className="space-y-2">
          {visible.map((product) => {
            const low = product.stock <= product.lowStock;
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    setProductId(product.id);
                    setMode("receive");
                    setQty("");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-start ring-1 ring-line"
                >
                  {product.image ? <img src={product.image} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-pine-soft text-sm font-semibold text-pine">{product.name.slice(0, 1)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{product.name}</span>
                    <span className={`text-sm ${low ? "text-copper" : "text-muted"}`}>{low ? "מתחת לסף" : "במלאי"} · סף {product.lowStock}</span>
                  </span>
                  <span className="text-end">
                    <span className="block font-semibold tabular-nums">{product.stock}</span>
                    <span className="text-xs text-muted tabular-nums">{formatILS(product.stock * product.price)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {visible.length === 0 ? <p className="py-8 text-center text-sm text-muted">אין פריטים להצגה.</p> : null}
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">תנועות אחרונות</h2>
          {moves.length === 0 ? (
            <p className="mt-2 text-sm text-muted">עדיין אין תנועות מלאי.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {moves.slice(0, 12).map((move) => (
                <li key={move.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{move.productName}</span>
                    <span className="text-muted">{STOCK_REASON_LABEL[move.reason]} · {formatWhen(move.at)}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${move.qty < 0 ? "text-copper" : "text-pine"}`}>
                    {move.qty > 0 ? "+" : ""}
                    {move.qty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {selected ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
          <form
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            className="w-full max-w-lg rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
          >
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <p className="text-sm text-muted">עכשיו במלאי: {selected.stock}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["receive", "קבלה"],
                  ["waste", "פחת"],
                  ["count", "ספירה"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMode(id)} className={`h-12 rounded-xl text-sm ${mode === id ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">{mode === "count" ? "כמות שנספרה" : "כמות"}</span>
              <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" dir="ltr" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">הערה</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setProductId(null)} className="h-12 rounded-2xl bg-paper">
                ביטול
              </button>
              <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
                עדכון
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${accent ? "text-copper" : ""}`}>{value}</p>
    </div>
  );
}
