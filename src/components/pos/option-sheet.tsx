import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { formatILS } from "@/lib/pos/money";
import { activeVariants, buildConfiguredLine, groupsFor, ruleLabel, stockOnHand } from "@/lib/pos/options";
import type { CartLine, ModifierGroup, Product } from "@/lib/pos/types";

type Step = { kind: "variant" } | { kind: "group"; group: ModifierGroup };

export function OptionSheet({
  product,
  presetVariantId,
  taken,
  onClose,
  onAdd,
}: {
  product: Product;
  presetVariantId?: string | null;
  taken: (variantId: string | null) => number;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const variants = activeVariants(product);
  const groups = groupsFor(product);
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [];
    if (variants.length && !presetVariantId) list.push({ kind: "variant" });
    for (const group of groups) list.push({ kind: "group", group });
    return list;
  }, [groups, presetVariantId, variants.length]);
  const [step, setStep] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(presetVariantId ?? null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");
  const current = steps[step] ?? null;
  const last = step >= steps.length - 1;
  const chosenVariant = variants.find((variant) => variant.id === variantId) ?? null;
  const preview = buildConfiguredLine({
    product,
    variantId,
    picks: Object.entries(picks).flatMap(([groupId, ids]) => ids.map((optionId) => ({ groupId, optionId }))),
    qty,
  });
  const cap = product.trackStock
    ? Math.max(0, stockOnHand(product, variantId) - taken(variantId))
    : 99;

  function toggle(group: ModifierGroup, optionId: string) {
    setPicks((currentPicks) => {
      const selected = currentPicks[group.id] ?? [];
      if (group.max <= 1) return { ...currentPicks, [group.id]: selected.includes(optionId) ? [] : [optionId] };
      if (selected.includes(optionId)) return { ...currentPicks, [group.id]: selected.filter((id) => id !== optionId) };
      if (selected.length >= group.max) return currentPicks;
      return { ...currentPicks, [group.id]: [...selected, optionId] };
    });
    setError("");
  }

  function stepReady(): boolean {
    if (!current) return true;
    if (current.kind === "variant") return Boolean(variantId);
    const count = (picks[current.group.id] ?? []).length;
    return count >= current.group.min && count <= current.group.max;
  }

  function add() {
    const line = buildConfiguredLine({
      product,
      variantId,
      picks: Object.entries(picks).flatMap(([groupId, ids]) => ids.map((optionId) => ({ groupId, optionId }))),
      qty,
    });
    if (!line) {
      setError("חסרה בחירה.");
      return;
    }
    if (product.trackStock && qty > cap) {
      setError("אין מספיק במלאי.");
      return;
    }
    onAdd(line);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
      <div role="dialog" aria-modal="true" className="scroll-pane max-h-full min-h-0 w-full max-w-lg rounded-t-3xl bg-surface p-4 text-ink sm:max-w-xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-12 w-12 items-center justify-center rounded-full bg-paper">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-copper">{preview ? formatILS(preview.unitPrice) : formatILS(chosenVariant?.price ?? product.price)}</p>
        {steps.length > 1 ? <p className="mt-1 text-sm text-muted">שלב {step + 1} מתוך {steps.length}</p> : null}
        {current?.kind === "variant" ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">בחרו אפשרות</p>
            {variants.map((variant) => {
              const left = product.trackStock ? variant.stock - taken(variant.id) : null;
              const out = left !== null && left <= 0;
              const on = variantId === variant.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={out}
                  onClick={() => {
                    setVariantId(variant.id);
                    setQty(1);
                    setError("");
                  }}
                  className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-start disabled:opacity-40 ${on ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                >
                  <span className="font-medium">{variant.name}</span>
                  <span className="tabular-nums">{formatILS(variant.price)}{variant.sku ? ` · ${variant.sku}` : ""}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {current?.kind === "group" ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">{current.group.name} · {ruleLabel(current.group)}</p>
            {current.group.options.map((option) => {
              const on = (picks[current.group.id] ?? []).includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(current.group, option.id)}
                  className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-start ${on ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                >
                  <span className="font-medium">{option.name}</span>
                  <span className="tabular-nums">{option.price ? `+${formatILS(option.price)}` : "כלול"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {last ? (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button type="button" aria-label="הפחתה" onClick={() => setQty((value) => Math.max(1, value - 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-paper ring-1 ring-line">
              <Minus />
            </button>
            <span className="w-8 text-center text-xl font-semibold tabular-nums">{qty}</span>
            <button type="button" aria-label="הוספה" onClick={() => setQty((value) => Math.min(cap || 1, value + 1))} className="flex h-12 w-12 items-center justify-center rounded-full bg-paper ring-1 ring-line">
              <Plus />
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((value) => value - 1)} className="min-h-12 rounded-2xl bg-paper text-sm font-medium ring-1 ring-line">
              חזרה
            </button>
          ) : (
            <span />
          )}
          {last ? (
            <button type="button" disabled={!stepReady()} onClick={add} className="min-h-14 rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40">
              הוספה
            </button>
          ) : (
            <button type="button" disabled={!stepReady()} onClick={() => setStep((value) => value + 1)} className="min-h-14 rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40">
              הבא
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
