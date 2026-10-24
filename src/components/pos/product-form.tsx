import { useState, type Dispatch, SetStateAction } from "react";
import { ProductOptionsFields } from "@/components/pos/product-options-fields";
import { compressImage } from "@/lib/pos/image";
import { roundMoney } from "@/lib/pos/money";
import { cleanGroups, cleanVariants } from "@/lib/pos/options";
import type { Category, Extra, ModifierGroup, Product, ProductVariant, Shelf, Supplier } from "@/lib/pos/types";

export type ProductDraft = {
  id: string | null;
  name: string;
  price: string;
  cost: string;
  supplierId: string;
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

export function emptyProductDraft(categoryId: string): ProductDraft {
  return {
    id: null,
    name: "",
    price: "",
    cost: "",
    supplierId: "",
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

export function draftFromProduct(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    price: String(product.price),
    cost: product.cost ? String(product.cost) : "",
    supplierId: product.supplierId ?? "",
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
  };
}

export function productFromDraft(draft: ProductDraft, fallbackCategoryId: string): { error: string } | { product: Product } {
  const price = roundMoney(Number(draft.price.replace(",", ".")));
  if (!draft.name.trim()) return { error: "צריך שם למוצר" };
  if (!Number.isFinite(price) || price <= 0) return { error: "המחיר צריך להיות גדול מאפס" };
  const costRaw = draft.cost.trim() ? roundMoney(Number(draft.cost.replace(",", "."))) : 0;
  if (!Number.isFinite(costRaw) || costRaw < 0) return { error: "העלות צריכה להיות אפס או יותר" };
  const stock = roundMoney(Number(draft.stock.replace(",", ".")));
  const lowStock = roundMoney(Number(draft.lowStock.replace(",", ".")));
  const extras = draft.extras
    .map((extra) => ({ ...extra, name: extra.name.trim().slice(0, 24), price: roundMoney(Number(extra.price)) }))
    .filter((extra) => extra.name && extra.price >= 0)
    .slice(0, 8);
  return {
    product: {
      id: draft.id ?? `p_${crypto.randomUUID()}`,
      name: draft.name.trim().slice(0, 40),
      price,
      cost: costRaw,
      supplierId: draft.supplierId,
      sku: draft.sku.trim().slice(0, 20),
      barcode: draft.barcode.trim().slice(0, 32),
      categoryId: draft.categoryId || fallbackCategoryId || "hot",
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
    },
  };
}

export function ProductFormDialog({
  draft,
  setDraft,
  error,
  categories,
  suppliers,
  vatRate,
  supplierName,
  onSupplierName,
  onClose,
  onSubmit,
  onCreateSupplier,
}: {
  draft: ProductDraft;
  setDraft: Dispatch<SetStateAction<ProductDraft | null>>;
  error: string;
  categories: Category[];
  suppliers: Supplier[];
  vatRate: number;
  supplierName: string;
  onSupplierName: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onCreateSupplier: () => void;
}) {
  const [imageError, setImageError] = useState("");

  function takeImage(file: File | undefined) {
    if (!file) return;
    setImageError("");
    void compressImage(file, 480)
      .then((image) => setDraft((current) => (current ? { ...current, image } : current)))
      .catch(() => setImageError("התמונה גדולה מדי או לא נקראה. נסו תמונה אחרת."));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-title"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
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
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted">מחיר כולל מע״מ {vatRate}%</span>
              <input
                inputMode="decimal"
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">עלות</span>
              <input
                inputMode="decimal"
                value={draft.cost}
                onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
                className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
                dir="ltr"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">ספק</span>
            <select
              value={draft.supplierId}
              onChange={(event) => setDraft({ ...draft, supplierId: event.target.value })}
              className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
            >
              <option value="">בלי ספק</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <input
              value={supplierName}
              onChange={(event) => onSupplierName(event.target.value)}
              placeholder="ספק חדש"
              aria-label="שם ספק חדש"
              className="h-12 min-w-0 flex-1 rounded-xl bg-paper px-3 ring-1 ring-line"
            />
            <button type="button" onClick={onCreateSupplier} className="h-12 shrink-0 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
              הוספת ספק
            </button>
          </div>
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
          <p className="text-xs text-muted">המדף העליון הוא מוצרים מהירים. המדף התחתון מציג מבצעים. הסדר נקבע בניהול.</p>
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
          <div className="rounded-2xl bg-paper p-3 ring-1 ring-line">
            <div className="flex items-center gap-3">
              {draft.image ? (
                <img src={draft.image} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-surface text-lg font-semibold text-pine">{draft.name.slice(0, 1) || "ת"}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">תמונה</p>
                <p className="text-xs text-muted">מצלמה, גלריה או קובץ. נדחסת ונשמרת עם המוצר.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="flex h-12 cursor-pointer items-center rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                    מצלמה
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(event) => {
                        takeImage(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <label className="flex h-12 cursor-pointer items-center rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                    גלריה
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        takeImage(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {draft.image ? (
                    <button type="button" onClick={() => setDraft({ ...draft, image: null })} className="h-12 rounded-xl px-3 text-sm text-copper">
                      הסרה
                    </button>
                  ) : null}
                </div>
                {imageError ? <p className="mt-2 text-xs text-copper">{imageError}</p> : null}
              </div>
            </div>
          </div>
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
                <button type="button" onClick={() => setDraft({ ...draft, extras: draft.extras.filter((_, itemIndex) => itemIndex !== index) })} className="h-12 rounded-xl px-2 text-sm text-copper">
                  הסרה
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, extras: [...draft.extras, { id: `x_${crypto.randomUUID()}`, name: "", price: 0 }].slice(0, 8) })}
              className="h-12 w-full rounded-xl bg-surface text-sm ring-1 ring-line"
            >
              תוספת
            </button>
          </div>
          <ProductOptionsFields draft={draft} setDraft={setDraft} />
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
          <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-paper font-medium">
            ביטול
          </button>
          <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
            שמירה
          </button>
        </div>
      </form>
    </div>
  );
}
