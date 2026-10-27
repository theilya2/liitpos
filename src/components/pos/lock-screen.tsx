import { useEffect, useState } from "react";
import { ActivationWait } from "@/components/pos/activation-wait";
import { ClockPanel } from "@/components/pos/clock-panel";
import { KioskExitMark } from "@/components/pos/kiosk-exit";
import { canSeeStore } from "@/lib/pos/access";
import { canUseBusiness, isDemoMode } from "@/lib/pos/demo";
import { tapKey } from "@/lib/pos/haptics";
import { lockView } from "@/lib/pos/lock-mode";
import { readSessionToken, setKioskLock } from "@/lib/pos/native";
import { registerCaption } from "@/lib/pos/register";
import { isWeekLocked, usePos } from "@/lib/pos/store";
import { syncNow, useCloudStatus } from "@/lib/pos/sync";
import { ROLE_LABEL } from "@/lib/pos/types";

export function LockScreen() {
  const gateStoreId = usePos((state) => state.gateStoreId);
  const stores = usePos((state) => state.stores);
  const staff = usePos((state) => state.staff);
  const login = usePos((state) => state.login);
  const setGateStore = usePos((state) => state.setGateStore);
  const lastGoodSync = usePos((state) => state.lastGoodSync);
  const appliedReleaseAt = usePos((state) => state.appliedReleaseAt);
  const registerNo = usePos((state) => state.registerNo);
  const registerName = usePos((state) => state.registerName);
  const registerBusinessId = usePos((state) => state.registerBusinessId);
  const registerRevoked = usePos((state) => state.registerRevoked);
  const activeLogo = usePos((state) => state.settings.logo);
  const phase = useCloudStatus((state) => state.phase);
  const detail = useCloudStatus((state) => state.detail);
  const attempt = useCloudStatus((state) => state.attempt);
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [clocking, setClocking] = useState(false);

  useEffect(() => {
    const refresh = () => setToken(readSessionToken());
    refresh();
    window.addEventListener("liitpos-session", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("liitpos-session", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const demo = isDemoMode();
  const gated = stores.find((store) => store.id === gateStoreId) ?? null;
  const bound = stores.find((store) => store.id === registerBusinessId) ?? null;
  const businessReady = Boolean(token && registerBusinessId && bound && gateStoreId === registerBusinessId);
  const business = demo ? gated : businessReady ? bound : null;
  const logo = business?.settings.logo || (business ? activeLogo : "");
  const visible = staff.filter((user) => user.active && business && canSeeStore(user, business.id) && canUseBusiness(business.id, business.settings.code));
  const weekLocked = isWeekLocked(lastGoodSync, appliedReleaseAt);
  const selected = visible.find((user) => user.id === userId)?.id ?? visible.find((user) => user.role === "cashier")?.id ?? visible[0]?.id ?? "";
  const view = lockView({
    demo,
    paired: Boolean(token),
    businessReady,
    staffCount: visible.length,
    phase,
    detail,
    attempt,
  });
  const caption = registerCaption(registerNo, registerName);

  function choose(nextCode: string) {
    const match = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode && canUseBusiness(store.id, store.settings.code));
    if (!match) {
      setCode("");
      setError("אין עסק עם המזהה הזה. אם הוא חדש, חברו לרשת ורק אז נסו שוב.");
      void syncNow().then(() => {
        const again = usePos.getState().stores.find((store) => store.id !== "store-empty" && store.settings.code === nextCode && canUseBusiness(store.id, store.settings.code));
        if (again) {
          setGateStore(again.id);
          if (usePos.getState().gateStoreId !== again.id) {
            setError("הקופה הזו משויכת לעסק אחר. רק הבעלים מוסיף קופה מהמשרד האחורי.");
            return;
          }
          setError("");
        }
      });
      return;
    }
    setPin("");
    setGateStore(match.id);
    if (usePos.getState().gateStoreId !== match.id) {
      setCode("");
      setError("הקופה הזו משויכת לעסק אחר. רק הבעלים מוסיף קופה מהמשרד האחורי.");
      return;
    }
    setError("");
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
        setShake((value) => value + 1);
        setError("הקוד לא מתאים למשתמש הזה בעסק שנבחר");
      }
    }
  }

  if (view.kind === "unpaired" || view.kind === "loading" || view.kind === "failed") {
    return (
      <main className="lock-screen min-h-0 flex-1 bg-paper text-ink">
        <div className="lock-board">
          <section className="lock-identity">
            <div className="flex items-center gap-3">
              <span className="lock-logo flex items-center justify-center rounded-2xl bg-pine font-bold text-pine-ink">₪</span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold">קופהקל</h1>
                <p className="truncate text-sm text-muted">{view.kind === "unpaired" ? "ממתינים לחיבור" : view.kind === "loading" ? "טוענים את העסק…" : "החיבור לעסק נכשל"}</p>
              </div>
            </div>
            {view.kind === "unpaired" ? <ActivationWait disconnected={registerRevoked} /> : null}
            {view.kind === "loading" ? <p className="mt-4 text-lg font-semibold text-pretty">טוענים את העסק…</p> : null}
            {view.kind === "failed" ? (
              <>
                <p className="lock-note mt-4 text-sm text-pretty text-copper">{view.detail}</p>
                <button type="button" onClick={() => void syncNow()} className="mt-4 min-h-12 rounded-xl bg-pine px-4 text-sm font-semibold text-pine-ink">
                  נסו שוב
                </button>
              </>
            ) : null}
          </section>
        </div>
        <KioskExitMark logo={null} onUnlocked={() => setKioskLock(false)} />
      </main>
    );
  }

  const showStaff = Boolean(business) && (view.kind === "pin" || view.kind === "code");
  const emptyStaff = view.kind === "pin" && view.emptyStaff;

  return (
    <main className="lock-screen min-h-0 flex-1 bg-paper text-ink">
      <div className="lock-board">
        {clocking && business ? (
          <ClockPanel storeId={business.id} onExit={() => setClocking(false)} />
        ) : (
        <>
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
          {showStaff && business ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {caption ? <span className="font-semibold text-ink">{caption}</span> : null}
                  {view.kind === "code" ? (
                    <>
                      {caption ? " · " : null}
                      מזהה <span className="font-semibold tabular-nums text-ink" dir="ltr">{business.settings.code}</span>
                    </>
                  ) : null}
                </p>
                {view.kind === "code" ? (
                  <button type="button" onClick={() => setGateStore(null)} className="min-h-12 rounded-xl bg-surface px-3 text-sm ring-1 ring-line">
                    עסק אחר
                  </button>
                ) : null}
              </div>
              {emptyStaff ? (
                <p className="lock-note mt-4 text-sm text-pretty text-muted">אין עובדים לעסק הזה. הבעלים צריך להוסיף עובד במשרד האחורי.</p>
              ) : (
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
              )}
              {showStaff && business && !emptyStaff ? (
                <button type="button" onClick={() => setClocking(true)} className="mt-3 min-h-12 w-full rounded-2xl bg-surface px-3 text-sm font-semibold ring-1 ring-line">
                  שעון נוכחות
                </button>
              ) : null}
              {emptyStaff ? null : (
                <div key={shake} className={shake ? "shake-flash rounded-3xl" : ""}>
                  <PinDots filled={pin.length} total={4} />
                </div>
              )}
              {emptyStaff ? null : error ? <p className="mt-2 text-center text-sm text-pretty text-copper">{error}</p> : <p className="mt-2 text-center text-sm text-muted">קוד בן 4 ספרות</p>}
              {demo && !emptyStaff ? <p className="mt-2 text-center text-xs text-pretty text-muted">במכולת: מנהל 1111 · אחראי 2222 · קופאי 3333. בקיוסק נכנסת המנהלת.</p> : null}
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
        {emptyStaff ? null : (
          <section className="lock-keys">
            <Keypad
              onDigit={showStaff ? pushPin : pushCode}
              onClear={() => {
                if (showStaff) setPin("");
                else setCode("");
                setError("");
              }}
            />
          </section>
        )}
        </>
        )}
      </div>
      <KioskExitMark logo={logo || null} onUnlocked={() => setKioskLock(false)} />
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
