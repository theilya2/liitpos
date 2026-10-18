import { useState } from "react";
import { X } from "lucide-react";
import { formatILS } from "@/lib/pos/money";
import { currentUser, usePos } from "@/lib/pos/store";

export function CashSheet({ onClose }: { onClose: () => void }) {
  const recordCash = usePos((state) => state.recordCash);
  const user = usePos(currentUser);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function save() {
    const value = Number(amount.replace(",", "."));
    if (!recordCash(direction, value, reason)) {
      setError("צריך סכום וסיבה, ועובד מחובר.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="w-full max-w-lg rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">תנועת מזומן</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-12 w-12 items-center justify-center rounded-full bg-paper">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted">נרשם על {user?.name || "העובד המחובר"} ונכנס לדוח Z.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setDirection("in")} className={`min-h-12 rounded-xl text-sm font-medium ${direction === "in" ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
            הכנסה לקופה
          </button>
          <button type="button" onClick={() => setDirection("out")} className={`min-h-12 rounded-xl text-sm font-medium ${direction === "out" ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
            הוצאה מהקופה
          </button>
        </div>
        <label className="mt-3 block text-sm text-muted">
          סכום
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" dir="ltr" className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums" />
        </label>
        <label className="mt-3 block text-sm text-muted">
          סיבה
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
        </label>
        {error ? <p className="mt-2 text-sm text-copper">{error}</p> : null}
        <button type="submit" className="mt-4 min-h-12 w-full rounded-2xl bg-pine font-semibold text-pine-ink">
          שמירה {amount ? formatILS(Number(amount.replace(",", ".")) || 0) : ""}
        </button>
      </form>
    </div>
  );
}
