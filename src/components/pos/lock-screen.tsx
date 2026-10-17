import { useState } from "react";
import { CloudLinkCard } from "@/components/pos/cloud-link";
import { canSeeStore } from "@/lib/pos/access";
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
  const visible = staff.filter((user) => user.active && business && canSeeStore(user, business.id));
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const weekLocked = isWeekLocked(lastGoodSync, appliedReleaseAt);
  const selected = visible.find((user) => user.id === userId)?.id ?? visible.find((user) => user.role === "cashier")?.id ?? visible[0]?.id ?? "";

  function choose(nextCode: string) {
    const match = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode);
    if (!match) {
      setCode("");
      setError("אין עסק עם המזהה הזה. אם הוא חדש, חברו לרשת ורק אז נסו שוב.");
      void syncNow().then(() => {
        const again = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode);
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
    <main className="scroll-pane min-h-0 flex-1 bg-paper text-ink">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 py-6">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine text-lg font-bold text-pine-ink">₪</span>
          )}
          <div>
            <h1 className="text-2xl font-semibold">קופהקל</h1>
            <p className="text-sm text-muted">{business ? business.settings.businessName : "מזהה העסק"}</p>
          </div>
        </div>
        {weekLocked ? (
          <p className="mt-4 rounded-2xl bg-copper-soft px-3 py-3 text-sm text-copper">
            הקופה נעולה כי עבר שבוע בלי חיבור לענן. אחרי כניסה אי אפשר למכור עד שהבעלים משחרר את הנעילה והקופה מתחברת שוב.
          </p>
        ) : null}
        {business ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">
                מזהה <span className="font-semibold tabular-nums text-ink" dir="ltr">{business.settings.code}</span>
              </p>
              <button type="button" onClick={() => setGateStore(null)} className="h-12 rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                עסק אחר
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
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
                  className={`flex h-14 items-center justify-between rounded-2xl px-4 text-start ${selected === user.id ? "bg-pine text-pine-ink" : "bg-surface ring-1 ring-line"}`}
                >
                  <span className="font-medium">{user.name}</span>
                  <span className={`text-sm ${selected === user.id ? "text-pine-ink" : "text-muted"}`}>{ROLE_LABEL[user.role]}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-center text-2xl font-semibold tracking-widest tabular-nums" dir="ltr">
              {"•".repeat(pin.length)}
              <span className="text-line">{"•".repeat(Math.max(0, 4 - pin.length))}</span>
            </p>
            {error ? <p className="mt-2 text-center text-sm text-copper">{error}</p> : <p className="mt-2 text-center text-sm text-muted">קוד בן 4 ספרות</p>}
            <Keypad
              onDigit={pushPin}
              onClear={() => {
                setPin("");
                setError("");
              }}
            />
            <p className="mt-auto pt-4 text-center text-xs text-muted">במכולת: מנהל 1111 · אחראי 2222 · קופאי 3333. בקיוסק נכנסת המנהלת.</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted">מקלידים את המזהה של העסק, ואז מופיעים רק המשתמשים שלו.</p>
            <p className="mt-5 text-center text-3xl font-semibold tracking-[0.3em] tabular-nums" dir="ltr">
              {code.padEnd(6, "·")}
            </p>
            {error ? <p className="mt-2 text-center text-sm text-copper">{error}</p> : <p className="mt-2 text-center text-sm text-muted">6 ספרות</p>}
            <Keypad
              onDigit={pushCode}
              onClear={() => {
                setCode("");
                setError("");
              }}
            />
            <p className="mt-auto pt-4 text-center text-xs text-muted">הדגמה: מכולת 100001 · קיוסק 200002</p>
          </>
        )}
        <div className="mt-4">
          <CloudLinkCard />
        </div>
      </div>
    </main>
  );
}

function Keypad({ onDigit, onClear }: { onDigit: (digit: string) => void; onClear: () => void }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2" dir="ltr">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "מחק", "0", "⌫"].map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            if (key === "⌫" || key === "מחק") onClear();
            else onDigit(key);
          }}
          className="h-14 rounded-2xl bg-surface text-lg font-semibold ring-1 ring-line"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
