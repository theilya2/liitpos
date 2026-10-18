import { useState } from "react";
import { compressImage } from "@/lib/pos/image";
import { usePos } from "@/lib/pos/store";
import type { UpsellRule } from "@/lib/pos/types";

export function KioskAdmin() {
  const settings = usePos((state) => state.settings);
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const updateSettings = usePos((state) => state.updateSettings);
  const slides = settings.kioskSlides ?? [];
  const rules = settings.upsellRules ?? [];
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [suggestId, setSuggestId] = useState("");

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">מסך הקיוסק</h2>
      <p className="text-sm text-pretty text-muted">תמונות מתחלפות במסך ההמתנה, והצעות שמופיעות לפני התשלום.</p>
      <ul className="space-y-2">
        {slides.map((slide) => (
          <li key={slide.id} className="flex items-center gap-3 rounded-xl bg-paper p-2 ring-1 ring-line">
            <img src={slide.image} alt="" className="h-14 w-20 rounded-lg object-cover" />
            <input
              value={slide.caption}
              aria-label="כיתוב לתמונה"
              onChange={(event) =>
                updateSettings({
                  kioskSlides: slides.map((item) => (item.id === slide.id ? { ...item, caption: event.target.value.slice(0, 80) } : item)),
                })
              }
              placeholder="כיתוב"
              className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface px-3 text-sm ring-1 ring-line"
            />
            <button
              type="button"
              onClick={() => updateSettings({ kioskSlides: slides.filter((item) => item.id !== slide.id) })}
              className="min-h-12 rounded-xl px-3 text-sm text-copper"
            >
              הסרה
            </button>
          </li>
        ))}
      </ul>
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-paper px-3 text-sm font-medium ring-1 ring-line">
        הוספת תמונה
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file || slides.length >= 8) return;
            void compressImage(file, 800).then((image) => {
              if (image.length > 150_000) return;
              updateSettings({
                kioskSlides: [...slides, { id: `slide_${crypto.randomUUID()}`, image, caption: "" }],
              });
            });
          }}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="מוצר שמפעיל הצעה" className="min-h-12 rounded-xl bg-paper px-2 text-sm ring-1 ring-line">
          <option value="">כל מוצר</option>
          {products.filter((product) => product.active).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="קטגוריה שמפעילה הצעה" className="min-h-12 rounded-xl bg-paper px-2 text-sm ring-1 ring-line">
          <option value="">כל קטגוריה</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select value={suggestId} onChange={(event) => setSuggestId(event.target.value)} aria-label="מוצר להצעה" className="min-h-12 rounded-xl bg-paper px-2 text-sm ring-1 ring-line">
          <option value="">מה להציע</option>
          {products.filter((product) => product.active).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={!suggestId}
        onClick={() => {
          const next: UpsellRule = {
            id: `up_${crypto.randomUUID()}`,
            productId,
            categoryId,
            suggestIds: [suggestId],
          };
          updateSettings({ upsellRules: [...rules, next].slice(0, 40) });
          setSuggestId("");
        }}
        className="min-h-12 w-full rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-40"
      >
        הוספת הצעה
      </button>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">
              {rule.productId ? products.find((product) => product.id === rule.productId)?.name ?? "מוצר" : rule.categoryId ? categories.find((category) => category.id === rule.categoryId)?.name ?? "קטגוריה" : "הכל"}
              {" ← "}
              {rule.suggestIds.map((id) => products.find((product) => product.id === id)?.name ?? id).join(", ")}
            </span>
            <button type="button" onClick={() => updateSettings({ upsellRules: rules.filter((item) => item.id !== rule.id) })} className="min-h-12 shrink-0 rounded-xl px-3 text-copper">
              הסרה
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
