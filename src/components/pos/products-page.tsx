import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ProductOptionsFields } from "@/components/pos/product-options-fields";
import { PageHeader } from "@/components/pos/shell";
import { compressImage } from "@/lib/pos/image";
import { formatILS, roundMoney } from "@/lib/pos/money";
import { usePos } from "@/lib/pos/store";
import { cleanGroups, cleanVariants } from "@/lib/pos/options";
import type { Extra, ModifierGroup, Product, ProductVariant, Shelf } from "@/lib/pos/types";

type Draft = {
  id: string | null;
  name: string;
  price: string;
  sku: string;
  barcode: string;
  categoryId: string;
  favorite: boolean;
  active: boolean;
  image: string | null;
  trackStock: boolean;
  stock: string;
  lowStock: string;
  shelf: Shelf;
  kiosk: boolean;
  extras: Extra[];
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
};

function emptyDraft(categoryId: string): Draft {
  return {
    id: null,
    name: "",
    price: "",
    sku: "",
    barcode: "",
    categoryId,
    favorite: false,
    active: true,
    image: null,
    trackStock: true,
    stock: "0",
    lowStock: "3",
    shelf: "off",
    kiosk: false,
    extras: [],
    variants: [],
    modifierGroups: [],
  };
}

export function ProductsPage() {
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const upsertProduct = usePos((state) => state.upsertProduct);
  const addCategory = usePos((state) => state.addCategory);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [newCategory, setNewCategory] = useState("");

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
    const price = roundMoney(Number(draft.price.replace(",", ".")));
    if (!draft.name.trim()) {
      setError("צריך שם למוצר");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("המחיר צריך להיות גדול מאפס");
      return;
    }
    const stock = roundMoney(Number(draft.stock.replace(",", ".")));
    const lowStock = roundMoney(Number(draft.lowStock.replace(",", ".")));
    const extras = draft.extras
      .map((extra) => ({ ...extra, name: extra.name.trim().slice(0, 24), price: roundMoney(Number(extra.price)) }))
      .filter((extra) => extra.name && extra.price >= 0)
      .slice(0, 8);
    const product: Product = {
      id: draft.id ?? `p_${crypto.randomUUID()}`,
      name: draft.name.trim().slice(0, 40),
      price,
      sku: draft.sku.trim().slice(0, 20),
      barcode: draft.barcode.trim().slice(0, 32),
      categoryId: draft.categoryId || categories[0]?.id || "hot",
      favorite: draft.favorite,
      active: draft.active,
      image: draft.image,
      trackStock: draft.trackStock,
      stock: Number.isFinite(stock) ? Math.max(0, stock) : 0,
      lowStock: Number.isFinite(lowStock) ? Math.max(0, lowStock) : 0,
      shelf: draft.shelf === "lower" ? "upper" : draft.shelf,
      kiosk: draft.kiosk,
      extras,
      variants: cleanVariants(draft.variants),
      modifierGroups: cleanGroups(draft.modifierGroups),
    };
    upsertProduct(product);
    setDraft(null);
    setError("");
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
        <div className="flex gap-2 overflow-x-auto">
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
                  setDraft({
                    id: product.id,
                    name: product.name,
                    price: String(product.price),
                    sku: product.sku,
                    barcode: product.barcode ?? "",
                    categoryId: product.categoryId,
                    favorite: product.favorite,
                    active: product.active,
                    image: product.image,
                    trackStock: product.trackStock,
                    stock: String(product.stock),
                    lowStock: String(product.lowStock),
                    shelf: product.shelf ?? "off",
                    kiosk: Boolean(product.kiosk),
                    extras: product.extras ?? [],
                    variants: product.variants ?? [],
                    modifierGroups: product.modifierGroups ?? [],
                  });
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-surface px-3 py-3 text-start ring-1 ring-line"
              >
                {product.image ? (
                  <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pine-soft text-sm font-semibold text-pine">
                    {product.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${product.active ? "" : "text-muted line-through"}`}>{product.name}</span>
                  <span className="text-sm text-muted">
                    {categoryName(product.categoryId)}
                    {product.sku ? ` · ${product.sku}` : ""}
                    {product.shelf === "off" ? "" : " · מדף עליון"}
                    {product.kiosk ? " · קיוסק" : ""}
                    {product.active ? "" : " · מוסתר"}
                    {product.variants?.length ? ` · ${product.variants.length} אפשרויות` : ""}
                    {product.modifierGroups?.length ? ` · ${product.modifierGroups.length} קבוצות` : ""}
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
          setDraft(emptyDraft(categoryId !== "all" ? categoryId : categories[0]?.id ?? "hot"));
        }}
        className="absolute end-4 bottom-4 z-10 flex h-14 items-center gap-2 rounded-full bg-pine px-5 font-semibold text-pine-ink"
      >
        <Plus className="size-5" />
        מוצר
      </button>
      {draft ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
          >
            <h2 id="product-title" className="text-lg font-semibold">
              {draft.id ? "עריכת מוצר" : "מוצר חדש"}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-muted">שם</span>
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">מחיר כולל מע״מ</span>
                <input
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                  dir="ltr"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">ברקוד נוסף</span>
                <input
                  value={draft.barcode}
                  onChange={(event) => setDraft({ ...draft, barcode: event.target.value })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                  dir="ltr"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">מק״ט / ברקוד</span>
                <input
                  value={draft.sku}
                  onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                  dir="ltr"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">קטגוריה</span>
                <select
                  value={draft.categoryId}
                  onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["upper", "במדף העליון"],
                    ["off", "לא במסך"],
                  ] as const
                ).map(([shelf, label]) => (
                  <button
                    key={shelf}
                    type="button"
                    onClick={() => setDraft({ ...draft, shelf })}
                    className={`h-12 rounded-xl text-sm font-medium ${(draft.shelf === "lower" ? "upper" : draft.shelf) === shelf ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">המדף העליון הוא רשת המוצרים. המדף התחתון מציג מבצעים מהניהול.</p>
              <button
                type="button"
                role="switch"
                aria-checked={draft.kiosk}
                onClick={() => setDraft({ ...draft, kiosk: !draft.kiosk })}
                className={`h-12 rounded-xl text-sm font-medium ${draft.kiosk ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
              >
                {draft.kiosk ? "מופיע בקיוסק" : "לא בקיוסק"}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={draft.active}
                onClick={() => setDraft({ ...draft, active: !draft.active })}
                className={`h-12 rounded-xl text-sm font-medium ${draft.active ? "bg-pine-soft text-pine" : "bg-paper text-muted ring-1 ring-line"}`}
              >
                {draft.active ? "מוצר פעיל" : "מוסתר"}
              </button>
              <div className="space-y-2 rounded-2xl bg-paper p-3 ring-1 ring-line">
                <p className="text-sm font-medium">תוספות לקיוסק</p>
                {draft.extras.map((extra, index) => (
                  <div key={extra.id} className="grid grid-cols-[1fr_5rem_auto] gap-2">
                    <input
                      value={extra.name}
                      aria-label="שם תוספת"
                      onChange={(event) => {
                        const extras = draft.extras.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item));
                        setDraft({ ...draft, extras });
                      }}
                      className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line"
                    />
                    <input
                      value={String(extra.price)}
                      aria-label="מחיר תוספת"
                      inputMode="decimal"
                      dir="ltr"
                      onChange={(event) => {
                        const extras = draft.extras.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, price: Number(event.target.value.replace(",", ".")) || 0 } : item,
                        );
                        setDraft({ ...draft, extras });
                      }}
                      className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, extras: draft.extras.filter((_, itemIndex) => itemIndex !== index) })}
                      className="h-12 rounded-xl px-2 text-sm text-copper"
                    >
                      הסרה
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      extras: [...draft.extras, { id: `x_${crypto.randomUUID()}`, name: "", price: 0 }].slice(0, 8),
                    })
                  }
                  className="h-12 w-full rounded-xl bg-surface text-sm ring-1 ring-line"
                >
                  תוספת
                </button>
              </div>
              <ProductOptionsFields draft={draft} setDraft={setDraft} />
              <div className="rounded-2xl bg-paper p-3 ring-1 ring-line">
                <div className="flex items-center gap-3">
                  {draft.image ? (
                    <img src={draft.image} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface text-lg font-semibold text-pine">
                      {draft.name.slice(0, 1) || "ת"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">תמונה</p>
                    <p className="text-xs text-muted">לא חובה. נשמרת במכשיר, בגודל קטן.</p>
                    <div className="mt-2 flex gap-2">
                      <label className="flex h-12 cursor-pointer items-center rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                        בחירה
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            void compressImage(file).then((image) => {
                              setDraft((current) => (current ? { ...current, image } : current));
                            });
                          }}
                        />
                      </label>
                      {draft.image ? (
                        <button type="button" onClick={() => setDraft({ ...draft, image: null })} className="h-12 rounded-xl px-3 text-sm text-copper">
                          הסרה
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.trackStock}
                onClick={() => setDraft({ ...draft, trackStock: !draft.trackStock })}
                className={`h-12 w-full rounded-xl text-sm font-medium ${draft.trackStock ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
              >
                {draft.trackStock ? "מלאי פעיל" : "בלי מעקב מלאי"}
              </button>
              {draft.trackStock ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-sm text-muted">כמות במלאי</span>
                    <input
                      inputMode="decimal"
                      value={draft.stock}
                      onChange={(event) => setDraft({ ...draft, stock: event.target.value })}
                      className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                      dir="ltr"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm text-muted">סף חוסר</span>
                    <input
                      inputMode="decimal"
                      value={draft.lowStock}
                      onChange={(event) => setDraft({ ...draft, lowStock: event.target.value })}
                      className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                      dir="ltr"
                    />
                  </label>
                </div>
              ) : null}
              {error ? <p className="text-sm text-copper">{error}</p> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDraft(null)} className="h-12 rounded-2xl bg-paper font-medium">
                ביטול
              </button>
              <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
                שמירה
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
