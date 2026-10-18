import { useEffect, useRef, useState, type PointerEvent } from "react";
import { canSeeStore } from "@/lib/pos/access";
import { companyLogo, hiddenCornerTaps, holdRatio, KIOSK_EXIT_HOLD_MS } from "@/lib/pos/kiosk";
import { usePos } from "@/lib/pos/store";

const RING_R = 28;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * Corner logo on the kiosk and the lock screen.
 * A five-second press, or five taps in the opposite corner, asks for the manager PIN.
 * Lock Task does not deliver the Home button, so this is the way out.
 */
export function KioskExitMark({ logo, onUnlocked }: { logo: string | null; onUnlocked: () => void }) {
  const staff = usePos((state) => state.staff);
  const activeStoreId = usePos((state) => state.activeStoreId);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const frame = useRef(0);
  const started = useRef(0);
  const taps = useRef<number[]>([]);
  const src = companyLogo(logo);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function stopHold() {
    cancelAnimationFrame(frame.current);
    started.current = 0;
    setProgress(0);
  }

  function beginHold(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    stopHold();
    event.currentTarget.setPointerCapture(event.pointerId);
    started.current = performance.now();
    const tick = (now: number) => {
      const ratio = holdRatio(started.current, now, KIOSK_EXIT_HOLD_MS);
      setProgress(ratio);
      if (ratio >= 1) {
        stopHold();
        setOpen(true);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  function cornerTap(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    const next = hiddenCornerTaps(taps.current, performance.now());
    taps.current = next.stamps;
    if (next.open) setOpen(true);
  }

  function push(digit: string) {
    const next = (typed + digit).slice(0, 4);
    setTyped(next);
    setError("");
    if (next.length < 4) return;
    const ok = staff.some((user) => user.active && user.role === "manager" && user.pin === next && canSeeStore(user, activeStoreId));
    if (!ok) {
      setTyped("");
      setError("קוד המנהל לא מתאים.");
      return;
    }
    setOpen(false);
    setTyped("");
    onUnlocked();
  }

  return (
    <>
      <button
        type="button"
        data-kiosk-logo
        aria-label="לוגו"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={beginHold}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        className="fixed z-50 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-sm ring-1 ring-line"
        style={{ top: "calc(var(--inset-top) + 0.75rem)", left: "calc(var(--inset-left) + 0.75rem)", touchAction: "none" }}
      >
        <img src={src} alt="" className="h-12 w-12 rounded-xl object-cover" />
        {progress > 0 ? (
          <svg viewBox="0 0 64 64" aria-hidden className="pointer-events-none absolute inset-0 text-pine">
            <circle cx="32" cy="32" r={RING_R} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
            <circle
              cx="32"
              cy="32"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN * (1 - progress)}
              transform="rotate(-90 32 32)"
            />
          </svg>
        ) : null}
      </button>
      <button
        type="button"
        data-kiosk-corner
        tabIndex={-1}
        aria-hidden
        onPointerUp={cornerTap}
        className="fixed z-50 h-16 w-16 opacity-0"
        style={{ top: "calc(var(--inset-top) + 0.75rem)", right: "calc(var(--inset-right) + 0.75rem)" }}
      />
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="קוד מנהל" className="w-full max-w-sm rounded-t-3xl bg-surface p-4 text-ink sm:rounded-3xl">
            <h2 className="text-lg font-semibold">קוד מנהל</h2>
            <p className="mt-1 text-sm text-pretty text-muted">רק קוד מנהל משחרר את נעילת הקיוסק.</p>
            <p className="mt-3 text-center text-2xl font-semibold tracking-[0.3em] tabular-nums" dir="ltr">
              {typed.padEnd(4, "·")}
            </p>
            {error ? <p className="mt-2 text-center text-sm text-copper">{error}</p> : null}
            <div className="mt-3 grid grid-cols-3 gap-2" dir="ltr">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "מחק", "0"].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === "מחק") {
                      setTyped("");
                      setError("");
                      return;
                    }
                    push(key);
                  }}
                  className="h-14 rounded-xl bg-paper font-semibold ring-1 ring-line"
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError("");
                }}
                className="h-14 rounded-xl bg-paper text-sm ring-1 ring-line"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
