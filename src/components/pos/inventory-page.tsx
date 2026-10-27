import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ProductFormDialog, draftFromProduct, emptyProductDraft, productFromDraft, type ProductDraft } from "@/components/pos/product-form";
import { PageHeader } from "@/components/pos/shell";
import { can } from "@/lib/pos/access";
import { formatILS, formatWhen, roundMoney } from "@/lib/pos/money";
import { stockRows } from "@/lib/pos/options";
import { placeOnShelf, selectTopShelf } from "@/lib/pos/shelves";
import { selectSuppliers } from "@/lib/pos/suppliers";
import { currentUser, usePos } from "@/lib/pos/store";
import { STOCK_REASON_LABEL, type StockReason } from "@/lib/pos/types";

export function InventoryPage() {
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const suppliers = usePos((state) => selectSuppliers(state.suppliers));
  const vatRate = usePos((state) => state.settings.vatRate);
  const topShelf = usePos((state) => selectTopShelf(state.settings.topShelf));
  const moves = usePos((state) => state.stockMoves);
  const adjustStock = usePos((state) => state.adjustStock);
  const upsertProduct = usePos((state) => state.upsertProduct);
  const addSupplier = usePos((state) => state.addSupplier);
  const updateSettings = usePos((state) => state.updateSettings);
  const user = usePos(currentUser);
  const canEdit = Boolean(user && can(user.role, "products"));
  const [lowOnly, setLowOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ productId: string; variantId: string | null; stock: number; name: string } | null>(null);
  const [mode, setMode] = useState<StockReason>("receive");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const rows = useMemo(() => stockRows(products), [products]);
  const stockValue = roundMoney(rows.reduce((sum, row) => sum + row.stock * row.price, 0));
  const lowCount = rows.filter((row) => row.stock <= row.lowStock).length;
  const visible = useMemo(() => {
    const q = query.trim();
    return rows
      .filter((row) => (lowOnly ? row.stock <= row.lowStock : true))
      .filter((row) => !q || row.name.includes(q) || row.sku.includes(q))
      .sort((a, b) => a.stock - b.stock);
  }, [rows, lowOnly, query]);

  function saveProduct() {
    if (!draft || !canEdit) return;
    const result = productFromDraft(draft, categories[0]?.id ?? "hot");
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    upsertProduct(result.product);
    if (topShelf.length) {
      updateSettings({ topShelf: placeOnShelf(topShelf, result.product.id, result.product.shelf !== "off") });
    }
    setDraft(null);
    setFormError("");
    setSupplierName("");
  }

  function apply() {
    if (!picked) return;
    const amount = Number(qty.replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return;
    const delta = mode === "count" ? amount - picked.stock : mode === "waste" ? -Math.abs(amount) : Math.abs(amount);
    adjustStock(picked.productId, delta, mode, note, picked.variantId);
    setQty("");
    setNote("");
    setPicked(null);
  }

  return (
    <div className="scroll-pane page-sheet min-h-0 flex-1">
      <PageHeader title="מלאי" subtitle="כמות במדף, שווי ופעולות קבלה, ספירה ופחת." />
      <div className="space-y-3 px-3 pb-6">
        <section className="grid grid-cols-3 gap-2">
          <Stat label="פריטים" value={String(rows.length)} />
          <Stat label="מתחת לסף" value={String(lowCount)} accent={lowCount > 0} />
          <Stat label="שווי מלאי" value={formatILS(stockValue)} />
        </section>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setFormError("");
              setSupplierName("");
              setDraft(emptyProductDraft(categories[0]?.id ?? "hot"));
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-pine px-4 text-sm font-semibold text-pine-ink"
          >
            <Plus className="size-4" />
            הוספת מוצר
          </button>
        ) : null}
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
          {visible.map((row) => {
            const low = row.stock <= row.lowStock;
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked({ productId: row.productId, variantId: row.variantId, stock: row.stock, name: row.name });
                    setMode("receive");
                    setQty("");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-start ring-1 ring-line"
                >
                  {row.image ? <img src={row.image} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-pine-soft text-sm font-semibold text-pine">{row.name.slice(0, 1)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className={`text-sm ${low ? "text-copper" : "text-muted"}`}>{low ? "מתחת לסף" : "במלאי"} · סף {row.lowStock}{row.sku ? ` · ${row.sku}` : ""}</span>
                  </span>
                  <span className="text-end">
                    <span className="block font-semibold tabular-nums">{row.stock}</span>
                    <span className="text-xs text-muted tabular-nums">{formatILS(row.stock * row.price)}</span>
                  </span>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      const product = products.find((item) => item.id === row.productId);
                      if (!product) return;
                      setFormError("");
                      setSupplierName("");
                      setDraft(draftFromProduct(product));
                    }}
                    className="mt-1 h-12 w-full rounded-2xl bg-paper text-sm ring-1 ring-line"
                  >
                    עריכת {row.name}
                  </button>
                ) : null}
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
      {picked ? (
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
            <h2 className="text-lg font-semibold">{picked.name}</h2>
            <p className="text-sm text-muted">עכשיו במלאי: {picked.stock}</p>
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
              <button type="button" onClick={() => setPicked(null)} className="h-12 rounded-2xl bg-paper">
                ביטול
              </button>
              <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
                עדכון
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {draft && canEdit ? (
        <ProductFormDialog
          draft={draft}
          setDraft={setDraft}
          error={formError}
          categories={categories}
          suppliers={suppliers}
          vatRate={vatRate}
          supplierName={supplierName}
          onSupplierName={setSupplierName}
          onClose={() => setDraft(null)}
          onSubmit={saveProduct}
          onCreateSupplier={() => {
            const id = addSupplier(supplierName);
            if (!id) return;
            setDraft((current) => (current ? { ...current, supplierId: id } : current));
            setSupplierName("");
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 break-words text-sm font-semibold tabular-nums ${accent ? "text-copper" : ""}`}>{value}</p>
    </div>
  );
}
