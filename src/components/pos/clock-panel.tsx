import { useState } from "react";
import { canSeeStore } from "@/lib/pos/access";
import { tapKey } from "@/lib/pos/haptics";
import { usePos } from "@/lib/pos/store";
import { clockActions, PUNCH_LABEL, selectPunches, shiftStatus } from "@/lib/pos/timeclock";
import type { PunchKind, StaffUser } from "@/lib/pos/types";

export function ClockPanel({ storeId, onExit }: { storeId: string; onExit: () => void }) {
  const staff = usePos((state) => state.staff);
  const punches = usePos((state) => selectPunches(state.punches));
  const clockPunch = usePos((state) => state.clockPunch);
  const [pin, setPin] = useState("");
  const [matched, setMatched] = useState<StaffUser | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const status = matched ? shiftStatus(punches, matched.id) : "out";

  function identify(next: string) {
    const matches = staff.filter((user) => user.active && user.pin === next && canSeeStore(user, storeId));
    if (!matches.length) {
      setPin("");
      setMatched(null);
      setError("קוד לא מוכר");
      return;
    }
    if (matches.length > 1) {
      setPin("");
      setMatched(null);
      setError("הקוד משויך ליותר מעובד אחד");
      return;
    }
    setMatched(matches[0]);
    setError("");
    setNote("");
  }

  function push(digit: string) {
    if (matched || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) identify(next);
  }

  function stamp(kind: PunchKind) {
    if (!matched) return;
    const result = clockPunch(pin, kind);
    setNote(result.message);
    setError(result.ok ? "" : result.message);
    if (result.ok) {
      setMatched(null);
      setPin("");
    }
  }

  return (
    <>
      <section className="lock-identity">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">שעון נוכחות</h2>
            <p className="text-sm text-muted">הקוד האישי נפרד מכניסה למכירה. הפסקה לא חובה.</p>
          </div>
          <button type="button" onClick={onExit} className="min-h-12 shrink-0 rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
            חזרה למכירה
          </button>
        </div>
        {matched ? (
          <div className="mt-4">
            <p className="text-lg font-semibold">{matched.name}</p>
            <p className="text-sm text-muted">{status === "out" ? "מחוץ למשמרת" : status === "break" ? "בהפסקה" : "במשמרת"}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {clockActions(status).map((action) => (
                <button key={action.kind} type="button" onClick={() => stamp(action.kind)} className="min-h-14 rounded-2xl bg-pine text-lg font-semibold text-pine-ink">
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMatched(null);
                  setPin("");
                  setError("");
                }}
                className="min-h-12 rounded-2xl bg-surface text-sm ring-1 ring-line"
              >
                עובד אחר
              </button>
            </div>
          </div>
        ) : (
          <div className="pin-dots mt-4" dir="ltr" aria-label={`${pin.length} מתוך 4`}>
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className={index < pin.length ? "pin-dot pin-dot-filled" : "pin-dot"} />
            ))}
          </div>
        )}
        {error ? <p className="mt-3 text-center text-sm text-pretty text-copper">{error}</p> : null}
        {note && !error ? <p className="mt-3 text-center text-sm text-pretty text-pine">{note}</p> : null}
        {!matched && !error ? <p className="mt-3 text-center text-sm text-muted">קוד אישי בן 4 ספרות, בלי לבחור שם</p> : null}
        {matched ? null : <p className="sr-only">{PUNCH_LABEL.in}</p>}
      </section>
      {matched ? null : (
        <section className="lock-keys">
          <div className="lock-pad" dir="ltr">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "מחק", "0", "⌫"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  tapKey();
                  if (key === "⌫" || key === "מחק") {
                    setPin("");
                    setError("");
                  } else push(key);
                }}
                className="lock-key rounded-2xl bg-surface font-semibold ring-1 ring-line"
              >
                {key}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
