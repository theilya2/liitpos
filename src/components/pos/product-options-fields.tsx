import type { Dispatch, SetStateAction } from "react";
import type { ModifierGroup, ProductVariant } from "@/lib/pos/types";

type DraftShape = {
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
};

export function ProductOptionsFields<T extends DraftShape>({ draft, setDraft }: { draft: T; setDraft: Dispatch<SetStateAction<T | null>> }) {
  return (
    <>
      <div className="space-y-2 rounded-2xl bg-paper p-3 ring-1 ring-line">
        <p className="text-sm font-medium">אפשרויות עם מחיר ומלאי</p>
        <p className="text-xs text-pretty text-muted">למשל קטן, בינוני וגדול. כל אפשרות נספרת לבד במלאי ובקבלה.</p>
        {draft.variants.map((variant, index) => (
          <div key={variant.id} className="grid grid-cols-2 gap-2">
            <input aria-label="שם אפשרות" value={variant.name} onChange={(event) => patchVariant(draft, setDraft, index, { name: event.target.value })} className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line" />
            <input aria-label="מחיר אפשרות" inputMode="decimal" dir="ltr" value={String(variant.price)} onChange={(event) => patchVariant(draft, setDraft, index, { price: Number(event.target.value.replace(",", ".")) || 0 })} className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line tabular-nums" />
            <input aria-label="מק״ט אפשרות" dir="ltr" value={variant.sku} onChange={(event) => patchVariant(draft, setDraft, index, { sku: event.target.value })} placeholder="מק״ט" className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line tabular-nums" />
            <input aria-label="ברקוד אפשרות" dir="ltr" value={variant.barcode} onChange={(event) => patchVariant(draft, setDraft, index, { barcode: event.target.value })} placeholder="ברקוד" className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line tabular-nums" />
            <input aria-label="מלאי אפשרות" inputMode="decimal" dir="ltr" value={String(variant.stock)} onChange={(event) => patchVariant(draft, setDraft, index, { stock: Number(event.target.value.replace(",", ".")) || 0 })} className="h-12 rounded-xl bg-surface px-2 text-sm ring-1 ring-line tabular-nums" />
            <button type="button" onClick={() => setDraft({ ...draft, variants: draft.variants.filter((_, itemIndex) => itemIndex !== index) })} className="h-12 rounded-xl text-sm text-copper">
              הסרת אפשרות
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              variants: [...draft.variants, { id: `v_${crypto.randomUUID()}`, name: "", price: 0, sku: "", barcode: "", stock: 0, active: true }].slice(0, 12),
            })
          }
          className="h-12 w-full rounded-xl bg-surface text-sm ring-1 ring-line"
        >
          אפשרות
        </button>
      </div>
      <div className="space-y-2 rounded-2xl bg-paper p-3 ring-1 ring-line">
        <p className="text-sm font-medium">קבוצות בחירה</p>
        <p className="text-xs text-pretty text-muted">חובה, בדיוק אחד, או עד כמה. כשיש קבוצה כזו, התוספות הישנות לא מוצגות בקופה.</p>
        {draft.modifierGroups.map((group, index) => (
          <div key={group.id} className="space-y-2 rounded-xl bg-surface p-2 ring-1 ring-line">
            <input aria-label="שם קבוצה" value={group.name} onChange={(event) => patchGroup(draft, setDraft, index, { name: event.target.value })} placeholder="שם הקבוצה" className="h-12 w-full rounded-xl bg-paper px-2 text-sm ring-1 ring-line" />
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => patchGroup(draft, setDraft, index, { required: !group.required, min: group.required ? 0 : Math.max(1, group.min) })} className={`min-h-12 rounded-xl px-2 text-xs ${group.required ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
                {group.required ? "חובה" : "לא חובה"}
              </button>
              <label className="text-xs text-muted">
                מינימום
                <input aria-label="מינימום" inputMode="numeric" dir="ltr" value={String(group.min)} onChange={(event) => patchGroup(draft, setDraft, index, { min: Number(event.target.value) || 0 })} className="mt-1 h-12 w-full rounded-xl bg-paper px-2 text-sm ring-1 ring-line tabular-nums" />
              </label>
              <label className="text-xs text-muted">
                מקסימום
                <input aria-label="מקסימום" inputMode="numeric" dir="ltr" value={String(group.max)} onChange={(event) => patchGroup(draft, setDraft, index, { max: Number(event.target.value) || 1 })} className="mt-1 h-12 w-full rounded-xl bg-paper px-2 text-sm ring-1 ring-line tabular-nums" />
              </label>
            </div>
            {group.options.map((option, optionIndex) => (
              <div key={option.id} className="grid grid-cols-[1fr_5rem_auto] gap-2">
                <input aria-label="שם בחירה" value={option.name} onChange={(event) => patchOption(draft, setDraft, index, optionIndex, { name: event.target.value })} className="h-12 rounded-xl bg-paper px-2 text-sm ring-1 ring-line" />
                <input aria-label="מחיר בחירה" inputMode="decimal" dir="ltr" value={String(option.price)} onChange={(event) => patchOption(draft, setDraft, index, optionIndex, { price: Number(event.target.value.replace(",", ".")) || 0 })} className="h-12 rounded-xl bg-paper px-2 text-sm ring-1 ring-line tabular-nums" />
                <button type="button" onClick={() => patchGroup(draft, setDraft, index, { options: group.options.filter((_, itemIndex) => itemIndex !== optionIndex) })} className="h-12 rounded-xl px-2 text-sm text-copper">
                  הסרה
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patchGroup(draft, setDraft, index, { options: [...group.options, { id: `o_${crypto.randomUUID()}`, name: "", price: 0 }].slice(0, 12) })}
              className="h-12 w-full rounded-xl bg-paper text-sm ring-1 ring-line"
            >
              בחירה
            </button>
            <button type="button" onClick={() => setDraft({ ...draft, modifierGroups: draft.modifierGroups.filter((_, itemIndex) => itemIndex !== index) })} className="h-12 w-full rounded-xl text-sm text-copper">
              הסרת קבוצה
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setDraft({
              ...draft,
              modifierGroups: [...draft.modifierGroups, { id: `g_${crypto.randomUUID()}`, name: "", required: true, min: 1, max: 1, options: [] }].slice(0, 6),
            })
          }
          className="h-12 w-full rounded-xl bg-surface text-sm ring-1 ring-line"
        >
          קבוצה
        </button>
      </div>
    </>
  );
}

function patchVariant<T extends DraftShape>(draft: T, setDraft: Dispatch<SetStateAction<T | null>>, index: number, patch: Partial<ProductVariant>) {
  setDraft({
    ...draft,
    variants: draft.variants.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  });
}

function patchGroup<T extends DraftShape>(draft: T, setDraft: Dispatch<SetStateAction<T | null>>, index: number, patch: Partial<ModifierGroup>) {
  setDraft({
    ...draft,
    modifierGroups: draft.modifierGroups.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  });
}

function patchOption<T extends DraftShape>(
  draft: T,
  setDraft: Dispatch<SetStateAction<T | null>>,
  groupIndex: number,
  optionIndex: number,
  patch: Partial<ModifierGroup["options"][number]>,
) {
  const group = draft.modifierGroups[groupIndex];
  if (!group) return;
  patchGroup(draft, setDraft, groupIndex, {
    options: group.options.map((item, index) => (index === optionIndex ? { ...item, ...patch } : item)),
  });
}
