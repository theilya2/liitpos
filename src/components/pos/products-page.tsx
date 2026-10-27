import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ProductFormDialog, draftFromProduct, emptyProductDraft, productFromDraft, type ProductDraft } from "@/components/pos/product-form";
import { pushToast } from "@/components/pos/toasts";
import { PageHeader } from "@/components/pos/shell";
import { formatILS } from "@/lib/pos/money";
import { placeOnShelf, selectTopShelf } from "@/lib/pos/shelves";
import { selectSuppliers } from "@/lib/pos/suppliers";
import { usePos } from "@/lib/pos/store";

export function ProductsPage() {
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const suppliers = usePos((state) => selectSuppliers(state.suppliers));
  const vatRate = usePos((state) => state.settings.vatRate);
  const topShelf = usePos((state) => selectTopShelf(state.settings.topShelf));
  const upsertProduct = usePos((state) => state.upsertProduct);
  const addCategory = usePos((state) => state.addCategory);
  const addSupplier = usePos((state) => state.addSupplier);
  const updateSettings = usePos((state) => state.updateSettings);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [error, setError] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [supplierName, setSupplierName] = useState("");

  const visible = useMemo(() => {
    const q = query.trim();
    return products.filter((product) => {
      if (categoryId !== "all" && product.categoryId !== categoryId) return false;
      if (!q) return true;
      return product.name.includes(q) || product.sku.includes(q) || (product.barcode ?? "").includes(q) || (product.variants ?? []).some((variant) => variant.name.includes(q) || variant.sku.includes(q) || variant.barcode.includes(q));
    });
  }, [products, query, categoryId]);

  function categoryName(id: string) {
    return categories.find((category) => category.id === id)?.name ?? "כללי";
  }

  function save() {
    if (!draft) return;
    const result = productFromDraft(draft, categories[0]?.id ?? "hot");
    if ("error" in result) {
      setError(result.error);
      pushToast(result.error);
      return;
    }
    upsertProduct(result.product);
    if (topShelf.length) {
      updateSettings({ topShelf: placeOnShelf(topShelf, result.product.id, result.product.shelf !== "off") });
    }
    setDraft(null);
    setError("");
    setSupplierName("");
  }

  function createSupplier() {
    const id = addSupplier(supplierName);
    if (!id) return;
    setDraft((current) => (current ? { ...current, supplierId: id } : current));
    setSupplierName("");
  }

  return (
    <div className="page-sheet relative flex min-h-0 flex-1 flex-col">
      <PageHeader title="מוצרים" subtitle="המדף של הקופה. מחירים לצרכן, כולל מע״מ." />
      <div className="shrink-0 space-y-3 px-3 pb-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש לפי שם או מק״ט"
          aria-label="חיפוש מוצר"
          className="h-12 w-full rounded-2xl bg-surface px-3 ring-1 ring-line"
        />
        <div className="chip-row flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setCategoryId("all")}
            className={`h-12 shrink-0 rounded-full px-4 text-sm ${categoryId === "all" ? "bg-pine font-semibold text-pine-ink" : "bg-surface ring-1 ring-line"}`}
          >
            הכל
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={`h-12 shrink-0 rounded-full px-4 text-sm ${categoryId === category.id ? "bg-pine font-semibold text-pine-ink" : "bg-surface ring-1 ring-line"}`}
            >
              {category.name}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = addCategory(newCategory);
            if (id) {
              setCategoryId(id);
              setNewCategory("");
            }
          }}
        >
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="קטגוריה חדשה"
            aria-label="שם קטגוריה חדשה"
            className="h-12 min-w-0 flex-1 rounded-2xl bg-surface px-3 ring-1 ring-line"
          />
          <button type="submit" className="h-12 shrink-0 rounded-2xl bg-paper px-4 text-sm font-medium ring-1 ring-line">
            הוספה
          </button>
        </form>
      </div>
      <div className="scroll-pane min-h-0 flex-1 px-3 pb-24">
        <ul className="space-y-2">
          {visible.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSupplierName("");
                  setDraft(draftFromProduct(product));
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-start ring-1 ring-line"
              >
                {product.image ? (
                  <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pine-soft text-sm font-semibold text-pine">{product.name.slice(0, 1)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${product.active ? "" : "text-muted line-through"}`}>{product.name}</span>
                  <span className="text-sm text-muted">
                    {categoryName(product.categoryId)}
                    {product.sku ? ` · ${product.sku}` : ""}
                    {product.shelf === "off" ? "" : " · מדף עליון"}
                    {product.cost ? ` · עלות ${formatILS(product.cost)}` : ""}
                    {product.trackStock ? ` · מלאי ${product.stock}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatILS(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 ? <p className="py-10 text-center text-sm text-muted">אין מוצרים ברשימה הזו.</p> : null}
      </div>
      <button
        type="button"
        onClick={() => {
          setError("");
          setSupplierName("");
          setDraft(emptyProductDraft(categoryId !== "all" ? categoryId : categories[0]?.id ?? "hot"));
        }}
        className="absolute end-4 bottom-4 z-10 flex h-14 items-center gap-2 rounded-full bg-pine px-5 font-semibold text-pine-ink"
      >
        <Plus className="size-5" />
        הוספת מוצר
      </button>
      {draft ? (
        <ProductFormDialog
          draft={draft}
          setDraft={setDraft}
          error={error}
          categories={categories}
          suppliers={suppliers}
          vatRate={vatRate}
          supplierName={supplierName}
          onSupplierName={setSupplierName}
          onClose={() => setDraft(null)}
          onSubmit={save}
          onCreateSupplier={createSupplier}
        />
      ) : null}
    </div>
  );
}
