import { useState } from "react";
import { selectPromos } from "@/lib/pos/promo";
import { usePos } from "@/lib/pos/store";
import type { Promo, PromoKind } from "@/lib/pos/types";

const KINDS: { id: PromoKind; label: string }[] = [
  { id: "bundle", label: "כמות במחיר, למשל 3 ב-10" },
  { id: "nth", label: "הפריט ה-N בהנחה, למשל השני ב-50%" },
  { id: "bxgy", label: "קנה X קבל Y, חינם או בהנחה" },
  { id: "bogo", label: "1+1" },
  { id: "percent", label: "אחוז על מוצר או קטגוריה" },
  { id: "amount", label: "סכום על מוצר או קטגוריה" },
  { id: "combo", label: "קומבו במחיר קבוע" },
  { id: "threshold", label: "הנחה כשהסל עובר סכום" },
];

const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function emptyPromo(): Promo {
  return {
    id: `promo_${crypto.randomUUID()}`,
    name: "",
    active: true,
    kind: "bundle",
    stackable: false,
    productId: "",
    categoryId: "",
    rewardProductId: "",
    buyQty: 3,
    getQty: 1,
    bundlePrice: 10,
    percent: 50,
    amount: 0,
    rewardPercent: 100,
    productIds: [],
    minSpend: 0,
    days: [],
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
  };
}

export function PromoAdmin() {
  const promos = usePos((state) => selectPromos(state.settings.promos));
  const products = usePos((state) => state.products);
  const categories = usePos((state) => state.categories);
  const updateSettings = usePos((state) => state.updateSettings);
  const [draft, setDraft] = useState<Promo | null>(null);
  const [error, setError] = useState("");

  function save(list: Promo[]) {
    updateSettings({ promos: list });
  }

  function commit() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("צריך שם למבצע.");
      return;
    }
    const targeted = draft.kind !== "threshold" && draft.kind !== "combo";
    if (targeted && !draft.productId && !draft.categoryId) {
      setError("צריך לבחור מוצר או קטגוריה.");
      return;
    }
    if (draft.kind === "percent" && draft.percent <= 0) {
      setError("צריך אחוז גדול מאפס.");
      return;
    }
    if (draft.kind === "amount" && draft.amount <= 0) {
      setError("צריך סכום גדול מאפס.");
      return;
    }
    if ((draft.kind === "bundle" || draft.kind === "combo") && draft.bundlePrice <= 0) {
      setError("צריך מחיר לחבילה.");
      return;
    }
    if (draft.kind === "combo" && draft.productIds.length < 2) {
      setError("קומבו צריך לפחות שני מוצרים.");
      return;
    }
    if (draft.kind === "nth" && (draft.buyQty < 2 || draft.percent <= 0)) {
      setError("צריך מספר פריט מ-2 ואחוז הנחה.");
      return;
    }
    if (draft.kind === "bxgy" && draft.rewardPercent <= 0) {
      setError("צריך אחוז הנחה על מה שמקבלים. 100 זה חינם.");
      return;
    }
    if (draft.kind === "threshold" && (draft.minSpend <= 0 || (draft.percent <= 0 && draft.amount <= 0))) {
      setError("צריך סכום סל והנחה באחוז או בשקלים.");
      return;
    }
    const next = { ...draft, name: name.slice(0, 40) };
    const exists = promos.some((promo) => promo.id === next.id);
    save(exists ? promos.map((promo) => (promo.id === next.id ? next : promo)) : [next, ...promos]);
    setDraft(null);
    setError("");
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">מבצעים</h2>
          <p className="text-sm text-muted">מופיעים במדף המבצעים וחלים לבד בסל. בלי שילוב נשמרת העסקה הטובה ללקוח, בלי הנחה כפולה על אותו פריט.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError("");
            setDraft(emptyPromo());
          }}
          className="h-12 shrink-0 rounded-xl bg-paper px-3 text-sm"
        >
          מבצע חדש
        </button>
      </div>
      {promos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">אין מבצעים. בלי רשימה הקופה מחשבת כמו קודם.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {promos.map((promo) => (
            <li key={promo.id} className="flex items-center gap-2 rounded-2xl bg-paper px-3 py-2 ring-1 ring-line">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setDraft({
                    ...emptyPromo(),
                    ...promo,
                    rewardPercent: promo.rewardPercent ?? 100,
                    productIds: promo.productIds ?? [],
                    minSpend: promo.minSpend ?? 0,
                  });
                }}
                className="min-h-12 min-w-0 flex-1 text-start"
              >
                <span className="block truncate font-medium">{promo.name}</span>
                <span className="text-sm text-muted">
                  {KINDS.find((kind) => kind.id === promo.kind)?.label}
                  {promo.stackable ? " · ניתן לשילוב" : ""}
                  {promo.active ? "" : " · כבוי"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => save(promos.map((item) => (item.id === promo.id ? { ...item, active: !item.active } : item)))}
                className={`h-12 shrink-0 rounded-xl px-3 text-sm ${promo.active ? "bg-pine-soft text-pine" : "bg-surface ring-1 ring-line"}`}
              >
                {promo.active ? "פעיל" : "כבוי"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm text-muted">שם על הקבלה</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">סוג</span>
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as PromoKind })}
              className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
            >
              {KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          {draft.kind === "combo" ? (
            <ComboPicker
              products={products}
              ids={draft.productIds}
              onChange={(productIds) => setDraft({ ...draft, productIds })}
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-muted">{draft.kind === "threshold" ? "מוצר (רשות)" : "מוצר"}</span>
                <select
                  value={draft.productId}
                  onChange={(event) => setDraft({ ...draft, productId: event.target.value, categoryId: event.target.value ? "" : draft.categoryId })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
                >
                  <option value="">{draft.kind === "threshold" ? "כל הסל" : "בלי מוצר"}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">{draft.kind === "threshold" ? "או קטגוריה (רשות)" : "או קטגוריה"}</span>
                <select
                  value={draft.categoryId}
                  onChange={(event) => setDraft({ ...draft, categoryId: event.target.value, productId: event.target.value ? "" : draft.productId })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
                >
                  <option value="">בלי קטגוריה</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {draft.kind === "bxgy" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <NumberField label="קונים" value={draft.buyQty} onChange={(buyQty) => setDraft({ ...draft, buyQty })} />
              <NumberField label="מקבלים" value={draft.getQty} onChange={(getQty) => setDraft({ ...draft, getQty })} />
              <NumberField label="הנחה על מה שמקבלים, 100 = חינם" value={draft.rewardPercent} onChange={(rewardPercent) => setDraft({ ...draft, rewardPercent })} />
              <label className="block">
                <span className="mb-1 block text-sm text-muted">פריט מתנה</span>
                <select
                  value={draft.rewardProductId}
                  onChange={(event) => setDraft({ ...draft, rewardProductId: event.target.value })}
                  className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
                >
                  <option value="">אותו פריט</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {draft.kind === "bundle" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="כמות" value={draft.buyQty} onChange={(buyQty) => setDraft({ ...draft, buyQty })} />
              <NumberField label="מחיר לחבילה" value={draft.bundlePrice} step="0.1" onChange={(bundlePrice) => setDraft({ ...draft, bundlePrice })} />
            </div>
          ) : null}
          {draft.kind === "nth" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="מספר הפריט, 2 = השני" value={draft.buyQty} onChange={(buyQty) => setDraft({ ...draft, buyQty })} />
              <NumberField label="אחוז הנחה על הפריט" value={draft.percent} onChange={(percent) => setDraft({ ...draft, percent })} />
            </div>
          ) : null}
          {draft.kind === "combo" ? <NumberField label="מחיר קומבו" value={draft.bundlePrice} step="0.1" onChange={(bundlePrice) => setDraft({ ...draft, bundlePrice })} /> : null}
          {draft.kind === "percent" ? <NumberField label="אחוז הנחה" value={draft.percent} onChange={(percent) => setDraft({ ...draft, percent })} /> : null}
          {draft.kind === "amount" ? <NumberField label="סכום הנחה" value={draft.amount} step="0.1" onChange={(amount) => setDraft({ ...draft, amount })} /> : null}
          {draft.kind === "threshold" ? (
            <div className="space-y-2">
              <NumberField label="החל מסכום" value={draft.minSpend} step="0.1" onChange={(minSpend) => setDraft({ ...draft, minSpend })} />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, amount: 0, percent: draft.percent > 0 ? draft.percent : 10 })}
                  className={`h-12 rounded-xl text-sm ${draft.amount <= 0 ? "bg-pine font-semibold text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                >
                  אחוז
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, percent: 0, amount: draft.amount > 0 ? draft.amount : 10 })}
                  className={`h-12 rounded-xl text-sm ${draft.amount > 0 ? "bg-pine font-semibold text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                >
                  סכום
                </button>
              </div>
              {draft.amount > 0 ? (
                <NumberField label="סכום הנחה" value={draft.amount} step="0.1" onChange={(amount) => setDraft({ ...draft, amount, percent: 0 })} />
              ) : (
                <NumberField label="אחוז הנחה" value={draft.percent} onChange={(percent) => setDraft({ ...draft, percent, amount: 0 })} />
              )}
            </div>
          ) : null}
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-paper px-3 ring-1 ring-line">
            <span className="text-sm">ניתן לשילוב עם מבצעים אחרים</span>
            <input type="checkbox" checked={draft.stackable} onChange={(event) => setDraft({ ...draft, stackable: event.target.checked })} className="size-5" />
          </label>
          <div>
            <p className="mb-1 text-sm text-muted">ימים (ריק = כל השבוע)</p>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((label, day) => {
                const on = draft.days.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((item) => item !== day) : [...draft.days, day].sort() })}
                    className={`h-12 rounded-xl text-sm ${on ? "bg-pine font-semibold text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted">משעה</span>
              <input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" dir="ltr" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">עד שעה</span>
              <input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" dir="ltr" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">מתאריך</span>
              <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" dir="ltr" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">עד תאריך</span>
              <input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" dir="ltr" />
            </label>
          </div>
          {error ? <p className="text-sm text-copper">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(null)} className="h-12 rounded-2xl bg-paper ring-1 ring-line">
              ביטול
            </button>
            <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
              שמירה
            </button>
          </div>
          {promos.some((promo) => promo.id === draft.id) ? (
            <button
              type="button"
              onClick={() => {
                save(promos.filter((promo) => promo.id !== draft.id));
                setDraft(null);
              }}
              className="h-12 w-full rounded-2xl bg-copper-soft font-medium text-copper"
            >
              מחיקת המבצע
            </button>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function ComboPicker({
  products,
  ids,
  onChange,
}: {
  products: { id: string; name: string }[];
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">מוצרים בקומבו. אותו מוצר פעמיים אומר שתיים ממנו.</p>
      {ids.length ? (
        <ul className="space-y-1">
          {ids.map((id, index) => (
            <li key={`${id}-${index}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{products.find((product) => product.id === id)?.name ?? "מוצר"}</span>
              <button type="button" onClick={() => onChange(ids.filter((_, item) => item !== index))} className="h-12 shrink-0 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
                הסרה
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">עדיין אין מוצרים בקומבו.</p>
      )}
      <label className="block">
        <span className="mb-1 block text-sm text-muted">הוספת מוצר</span>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value || ids.length >= 12) return;
            onChange([...ids, event.target.value]);
          }}
          className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
        >
          <option value="">בחרו מוצר</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NumberField({ label, value, onChange, step = "1" }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(event) => onChange(Number(event.target.value))}
        inputMode="decimal"
        step={step}
        dir="ltr"
        className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums"
      />
    </label>
  );
}
