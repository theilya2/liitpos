import { useState } from "react";
import { CloudLinkCard } from "@/components/pos/cloud-link";
import { canSeeStore } from "@/lib/pos/access";
import { canUseBusiness, isDemoMode } from "@/lib/pos/demo";
import { tapKey } from "@/lib/pos/haptics";
import { isWeekLocked, usePos } from "@/lib/pos/store";
import { syncNow } from "@/lib/pos/sync";
import { ROLE_LABEL } from "@/lib/pos/types";

export function LockScreen() {
  const gateStoreId = usePos((state) => state.gateStoreId);
  const stores = usePos((state) => state.stores);
  const staff = usePos((state) => state.staff);
  const login = usePos((state) => state.login);
  const setGateStore = usePos((state) => state.setGateStore);
  const lastGoodSync = usePos((state) => state.lastGoodSync);
  const appliedReleaseAt = usePos((state) => state.appliedReleaseAt);
  const business = stores.find((store) => store.id === gateStoreId) ?? null;
  const activeLogo = usePos((state) => state.settings.logo);
  const logo = business?.settings.logo || activeLogo;
  const visible = staff.filter((user) => user.active && business && canSeeStore(user, business.id) && canUseBusiness(business.id, business.settings.code));
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const weekLocked = isWeekLocked(lastGoodSync, appliedReleaseAt);
  const selected = visible.find((user) => user.id === userId)?.id ?? visible.find((user) => user.role === "cashier")?.id ?? visible[0]?.id ?? "";
  const demo = isDemoMode();

  function choose(nextCode: string) {
    const match = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode && canUseBusiness(store.id, store.settings.code));
    if (!match) {
      setCode("");
      setError("אין עסק עם המזהה הזה. אם הוא חדש, חברו לרשת ורק אז נסו שוב.");
      void syncNow().then(() => {
        const again = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode && canUseBusiness(store.id, store.settings.code));
        if (again) {
          setError("");
          setGateStore(again.id);
        }
      });
      return;
    }
    setError("");
    setPin("");
    setGateStore(match.id);
  }

  function pushCode(digit: string) {
    if (code.length >= 6) return;
    const next = code + digit;
    setCode(next);
    setError("");
    if (next.length === 6) choose(next);
  }

  function pushPin(digit: string) {
    if (pin.length >= 4 || !selected) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) {
      const ok = login(selected, next);
      if (!ok) {
        setPin("");
        setError("הקוד לא מתאים למשתמש הזה בעסק שנבחר");
      }
    }
  }

  return (
    <main className="lock-screen min-h-0 flex-1 bg-paper text-ink">
      <div className="lock-board">
        <section className="lock-identity">
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="" className="lock-logo rounded-2xl object-cover" />
            ) : (
              <span className="lock-logo flex items-center justify-center rounded-2xl bg-pine font-bold text-pine-ink">₪</span>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">קופהקל</h1>
              <p className="truncate text-sm text-muted">{business ? business.settings.businessName : "מזהה העסק"}</p>
            </div>
          </div>
          {weekLocked ? (
            <p className="lock-note mt-3 rounded-2xl bg-copper-soft px-3 py-2 text-sm text-pretty text-copper">
              הקופה נעולה כי עבר שבוע בלי חיבור לענן. אחרי כניסה אי אפשר למכור עד שהבעלים משחרר את הנעילה והקופה מתחברת שוב.
            </p>
          ) : null}
          {business ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  מזהה <span className="font-semibold tabular-nums text-ink" dir="ltr">{business.settings.code}</span>
                </p>
                <button type="button" onClick={() => setGateStore(null)} className="min-h-12 rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                  עסק אחר
                </button>
              </div>
              <div className="lock-staff mt-2 grid grid-cols-1 gap-2">
                {visible.length === 0 ? <p className="text-sm text-muted">אין משתמשים פעילים לעסק הזה.</p> : null}
                {visible.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setUserId(user.id);
                      setPin("");
                      setError("");
                    }}
                    className={`flex min-h-12 items-center justify-between rounded-2xl px-3 text-start ${selected === user.id ? "bg-pine text-pine-ink" : "bg-surface ring-1 ring-line"}`}
                  >
                    <span className="font-medium">{user.name}</span>
                    <span className={`text-sm ${selected === user.id ? "text-pine-ink" : "text-muted"}`}>{ROLE_LABEL[user.role]}</span>
                  </button>
                ))}
              </div>
              <PinDots filled={pin.length} total={4} />
              {error ? <p className="mt-2 text-center text-sm text-pretty text-copper">{error}</p> : <p className="mt-2 text-center text-sm text-muted">קוד בן 4 ספרות</p>}
              {demo ? <p className="mt-2 text-center text-xs text-pretty text-muted">במכולת: מנהל 1111 · אחראי 2222 · קופאי 3333. בקיוסק נכנסת המנהלת.</p> : null}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-pretty text-muted">מקלידים את המזהה של העסק, ואז מופיעים רק המשתמשים שלו.</p>
              <PinDots filled={code.length} total={6} glyph="digit" digits={code} />
              {error ? <p className="mt-2 text-center text-sm text-pretty text-copper">{error}</p> : <p className="mt-2 text-center text-sm text-muted">6 ספרות</p>}
              {demo ? <p className="mt-2 text-center text-xs text-pretty text-muted">הדגמה: מכולת 100001 · קיוסק 200002</p> : null}
            </>
          )}
        </section>
        <section className="lock-keys">
          <Keypad
            onDigit={business ? pushPin : pushCode}
            onClear={() => {
              if (business) setPin("");
              else setCode("");
              setError("");
            }}
          />
        </section>
      </div>
      <div className="lock-cloud">
        <CloudLinkCard />
      </div>
    </main>
  );
}

function PinDots({ filled, total, glyph = "dot", digits = "" }: { filled: number; total: number; glyph?: "dot" | "digit"; digits?: string }) {
  return (
    <div className="pin-dots" dir="ltr" aria-label={glyph === "digit" ? digits.padEnd(total, "·") : `${filled} מתוך ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < filled ? "pin-dot pin-dot-filled" : "pin-dot"}>
          {glyph === "digit" && digits[index] ? digits[index] : ""}
        </span>
      ))}
    </div>
  );
}

function Keypad({ onDigit, onClear }: { onDigit: (digit: string) => void; onClear: () => void }) {
  return (
    <div className="lock-pad" dir="ltr">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "מחק", "0", "⌫"].map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            tapKey();
            if (key === "⌫" || key === "מחק") onClear();
            else onDigit(key);
          }}
          className="lock-key rounded-2xl bg-surface font-semibold ring-1 ring-line"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
