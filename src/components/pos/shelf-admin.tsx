import { useState } from "react";
import { moveShelfSlot, seedTopShelf, selectTopShelf } from "@/lib/pos/shelves";
import { usePos } from "@/lib/pos/store";
import type { ShelfRef } from "@/lib/pos/types";

export function ShelfAdmin() {
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const slots = usePos((state) => selectTopShelf(state.settings.topShelf));
  const updateSettings = usePos((state) => state.updateSettings);
  const [kind, setKind] = useState<ShelfRef["kind"]>("product");
  const [pick, setPick] = useState("");

  function commit(next: ShelfRef[]) {
    updateSettings({ topShelf: next });
  }

  function label(slot: ShelfRef) {
    if (slot.kind === "category") return categories.find((category) => category.id === slot.id)?.name ?? "קטגוריה";
    return products.find((product) => product.id === slot.id)?.name ?? "מוצר";
  }

  const choices = kind === "product" ? products.filter((product) => product.active) : categories;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">מדף עליון</h2>
      <p className="mt-1 text-sm text-pretty text-muted">מוצרים וקטגוריות, בסדר שמופיע במסך המכירה. המדף התחתון הוא מבצעים.</p>
      {slots.length === 0 ? (
        <button type="button" onClick={() => commit(seedTopShelf(products))} className="mt-3 h-12 w-full rounded-xl bg-paper text-sm font-medium ring-1 ring-line">
          סידור לפי המוצרים שכבר על המדף
        </button>
      ) : (
        <ol className="mt-3 space-y-2">
          {slots.map((slot, index) => (
            <li key={`${slot.kind}:${slot.id}`} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 ring-1 ring-line">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="text-muted">{slot.kind === "category" ? "קטגוריה · " : ""}</span>
                {label(slot)}
              </span>
              <button type="button" aria-label="הזזה למעלה" onClick={() => commit(moveShelfSlot(slots, index, -1))} className="h-12 w-12 rounded-xl bg-surface text-lg">
                ↑
              </button>
              <button type="button" aria-label="הזזה למטה" onClick={() => commit(moveShelfSlot(slots, index, 1))} className="h-12 w-12 rounded-xl bg-surface text-lg">
                ↓
              </button>
              <button type="button" onClick={() => commit(slots.filter((_, item) => item !== index))} className="h-12 rounded-xl px-3 text-sm text-copper">
                הסרה
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setKind("product")} className={`h-12 rounded-xl text-sm ${kind === "product" ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
          מוצר
        </button>
        <button type="button" onClick={() => setKind("category")} className={`h-12 rounded-xl text-sm ${kind === "category" ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
          קטגוריה
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label="פריט למדף העליון" className="h-12 min-w-0 flex-1 rounded-xl bg-paper px-3 ring-1 ring-line">
          <option value="">בחירה</option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!pick || slots.some((slot) => slot.kind === kind && slot.id === pick)) return;
            commit([...slots, { kind, id: pick }]);
            setPick("");
          }}
          className="h-12 shrink-0 rounded-xl bg-pine px-4 text-sm font-semibold text-pine-ink"
        >
          הוספה
        </button>
      </div>
    </section>
  );
}
