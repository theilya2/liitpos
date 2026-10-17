import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { computeTotals, formatILS, roundCash, roundMoney } from "@/lib/pos/money";
import { usePos } from "@/lib/pos/store";
import { chargeTerminal, deviceLabel, paymentPlan, terminalOrigin } from "@/lib/pos/terminal";
import type { CartLine, Extra, Product, TenderMethod, TerminalKind } from "@/lib/pos/types";

type Pick = { product: Product; extras: string[]; qty: number };

export function KioskPage() {
  const products = usePos((state) => state.products);
  const settings = usePos((state) => state.settings);
  const checkout = usePos((state) => state.checkout);
  const nextReceipt = usePos((state) => state.nextReceipt);
  const lock = usePos((state) => state.lock);
  const menu = useMemo(() => products.filter((product) => product.active && product.kiosk), [products]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [pay, setPay] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const navigate = useNavigate();
  const totals = computeTotals(cart, null, settings.vatRate);

  function qtyOf(productId: string) {
    return cart.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.qty, 0);
  }

  function addPick() {
    if (!pick) return;
    const chosen = pick.product.extras.filter((extra) => pick.extras.includes(extra.id));
    const unitPrice = roundMoney(pick.product.price + chosen.reduce((sum, extra) => sum + extra.price, 0));
    const name = chosen.length ? `${pick.product.name} (${chosen.map((extra) => extra.name).join(", ")})` : pick.product.name;
    const line: CartLine = { key: `k_${crypto.randomUUID()}`, productId: pick.product.id, name: name.slice(0, 80), unitPrice, qty: pick.qty };
    setCart((current) => [...current, line]);
    setPick(null);
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-paper text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        {settings.logo ? (
          <img src={settings.logo} alt="" className="h-12 w-12 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine text-lg font-bold text-pine-ink">₪</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{settings.businessName}</h1>
          <p className="text-sm text-muted">הזמנה עצמית · מחירים כוללים מע״מ</p>
        </div>
        <button type="button" onClick={() => setExitOpen(true)} className="h-12 rounded-xl px-3 text-sm text-muted">
          יציאה
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {menu.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">התפריט עדיין ריק. בעל העסק מסמן מוצרים כ״מופיע בקיוסק״.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {menu.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setPick({ product, extras: [], qty: 1 })}
                className="overflow-hidden rounded-3xl bg-surface text-start ring-1 ring-line transition-transform duration-150 active:scale-95"
              >
                <span className="block aspect-square overflow-hidden bg-pine-soft">
                  {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-3xl font-semibold text-pine">{product.name.slice(0, 1)}</span>}
                </span>
                <span className="block px-3 py-3">
                  <span className="block text-base font-semibold">{product.name}</span>
                  <span className="mt-1 block text-sm font-semibold tabular-nums text-copper">{formatILS(product.price)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <button
          type="button"
          disabled={!cart.length}
          onClick={() => setPay(true)}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-pine px-4 text-lg font-semibold text-pine-ink disabled:opacity-40"
        >
          <span>לתשלום</span>
          <span className="tabular-nums">{formatILS(totals.total)}</span>
        </button>
      </div>
      {pick ? (
        <Sheet title={pick.product.name} onClose={() => setPick(null)}>
          <p className="text-2xl font-semibold tabular-nums text-copper">{formatILS(roundMoney(pick.product.price + extraSum(pick.product.extras, pick.extras)))}</p>
          {pick.product.extras.length ? (
            <ul className="mt-4 space-y-2">
              {pick.product.extras.map((extra) => {
                const on = pick.extras.includes(extra.id);
                return (
                  <li key={extra.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setPick({
                          ...pick,
                          extras: on ? pick.extras.filter((id) => id !== extra.id) : [...pick.extras, extra.id],
                        })
                      }
                      className={`flex h-14 w-full items-center justify-between rounded-2xl px-4 text-start ${on ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                    >
                      <span className="font-medium">{extra.name}</span>
                      <span className="tabular-nums">+{formatILS(extra.price)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">בלי תוספות לפריט הזה.</p>
          )}
          <div className="mt-4 flex items-center justify-center gap-4">
            <button type="button" aria-label="הפחתה" onClick={() => setPick({ ...pick, qty: Math.max(1, pick.qty - 1) })} className="flex h-12 w-12 items-center justify-center rounded-full bg-paper ring-1 ring-line">
              <Minus />
            </button>
            <span className="w-8 text-center text-xl font-semibold tabular-nums">{pick.qty}</span>
            <button
              type="button"
              aria-label="הוספה"
              onClick={() => {
                const cap = pick.product.trackStock ? Math.max(1, pick.product.stock - qtyOf(pick.product.id)) : 9;
                setPick({ ...pick, qty: Math.min(cap, pick.qty + 1) });
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-paper ring-1 ring-line"
            >
              <Plus />
            </button>
          </div>
          <button type="button" onClick={addPick} className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink">
            הוספה להזמנה
          </button>
        </Sheet>
      ) : null}
      {pay ? (
        <KioskPay
          total={totals.total}
          lines={cart}
          nextReceipt={nextReceipt}
          onClose={() => setPay(false)}
          onPaid={(number) => {
            setCart([]);
            setPay(false);
            setDone(number);
          }}
          checkout={checkout}
        />
      ) : null}
      {done !== null ? (
        <Sheet title="ההזמנה בדרך" onClose={() => setDone(null)}>
          <p className="text-lg">מספר {done} נשלח לקופה ונכנס לדוחות.</p>
          <p className="mt-2 text-sm text-muted">אם שילמתם במזומן, משלמים בדלפק. אפשר להתחיל הזמנה חדשה.</p>
          <button type="button" onClick={() => setDone(null)} className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink">
            הזמנה חדשה
          </button>
        </Sheet>
      ) : null}
      {exitOpen ? (
        <ExitGate
          code={settings.code}
          onClose={() => setExitOpen(false)}
          onLeave={() => {
            lock();
            void navigate({ to: "/" });
          }}
        />
      ) : null}
    </main>
  );
}

function extraSum(extras: Extra[], ids: string[]) {
  return extras.filter((extra) => ids.includes(extra.id)).reduce((sum, extra) => sum + extra.price, 0);
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
      <div role="dialog" aria-modal="true" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 text-ink sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-12 w-12 items-center justify-center rounded-full bg-paper">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KioskPay({
  total,
  lines,
  nextReceipt,
  onClose,
  onPaid,
  checkout,
}: {
  total: number;
  lines: CartLine[];
  nextReceipt: number;
  onClose: () => void;
  onPaid: (number: number) => void;
  checkout: ReturnType<typeof usePos.getState>["checkout"];
}) {
  const settings = usePos((state) => state.settings);
  const openDrawer = usePos((state) => state.openDrawer);
  const [method, setMethod] = useState<TenderMethod | null>(null);
  const [payments, setPayments] = useState(1);
  const [terminal, setTerminal] = useState<TerminalKind>("android");
  const [phase, setPhase] = useState<"idle" | "wait" | "fail">("idle");
  const [message, setMessage] = useState("");
  const due = method === "cash" ? roundCash(total) : total;
  const plan = paymentPlan(due, payments);
  const endpoint = terminal === "android" ? settings.androidTerminal : settings.pinpad;
  const ready = Boolean(terminalOrigin(endpoint));

  async function send() {
    if (method !== "card" && method !== "club") return;
    if (!ready) {
      setMessage("המסוף לא הוגדר. אפשר לשלם במזומן בדלפק.");
      return;
    }
    setPhase("wait");
    setMessage("");
    const result = await chargeTerminal({
      endpoint,
      amount: due,
      payments: plan.count,
      method: method === "club" ? "club" : "credit",
      receipt: nextReceipt,
      signal: AbortSignal.timeout(50_000),
    });
    if (!result.ok) {
      setPhase("fail");
      setMessage(result.message);
      return;
    }
    const sale = checkout({
      method,
      tendered: due,
      payments: plan.count,
      terminal,
      authCode: result.auth,
      cardLast4: result.last4,
      cardBrand: result.brand,
      lines,
      channel: "kiosk",
    });
    if (!sale) {
      setPhase("fail");
      setMessage("החיוב אושר אבל ההזמנה לא נשמרה. פנו לקופה.");
      return;
    }
    onPaid(sale.number);
  }

  return (
    <Sheet title="תשלום" onClose={onClose}>
      <p className="text-center text-3xl font-semibold tabular-nums">{formatILS(due)}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ["cash", "מזומן"],
            ["card", "אשראי"],
            ["club", "מועדון"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setMethod(id); setPhase("idle"); setMessage(""); }} className={`h-14 rounded-2xl text-sm font-semibold ${method === id ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
            {label}
          </button>
        ))}
      </div>
      {method === "cash" ? (
        <button
          type="button"
          onClick={() => {
            const sale = checkout({ method: "cash", tendered: due, lines, channel: "kiosk" });
            if (!sale) {
              setMessage("אי אפשר לסגור את ההזמנה. בדקו מלאי או נעילת שבוע.");
              return;
            }
            openDrawer();
            onPaid(sale.number);
          }}
          className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink"
        >
          אישור ותשלום בדלפק
        </button>
      ) : null}
      {method === "card" || method === "club" ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["android", "pinpad"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => setTerminal(kind)} className={`h-12 rounded-xl text-sm ${terminal === kind ? "bg-pine-soft font-semibold text-pine" : "bg-paper ring-1 ring-line"}`}>
                {deviceLabel(kind)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">תשלומים</span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setPayments((value) => Math.max(1, value - 1))} className="h-12 w-12 rounded-xl bg-paper ring-1 ring-line">-</button>
              <span className="w-6 text-center font-semibold tabular-nums">{plan.count}</span>
              <button type="button" onClick={() => setPayments((value) => Math.min(12, value + 1))} className="h-12 w-12 rounded-xl bg-paper ring-1 ring-line">+</button>
            </span>
          </div>
          {plan.count > 1 ? <p className="text-xs text-muted">ראשון {formatILS(plan.first)} ואז {formatILS(plan.rest)}</p> : null}
          <button type="button" disabled={!ready || phase === "wait"} onClick={() => void send()} className="h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40">
            {phase === "wait" ? "ממתינים למסוף…" : ready ? "שליחה למסוף" : "המסוף לא הוגדר"}
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-copper">{message}</p> : null}
    </Sheet>
  );
}

function ExitGate({ code, onClose, onLeave }: { code: string; onClose: () => void; onLeave: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  function push(digit: string) {
    const next = (typed + digit).slice(0, 6);
    setTyped(next);
    setError("");
    if (next.length === 6) {
      if (next === code) onLeave();
      else {
        setTyped("");
        setError("המזהה לא מתאים לעסק הזה.");
      }
    }
  }
  return (
    <Sheet title="יציאה מהקיוסק" onClose={onClose}>
      <p className="text-sm text-muted">מקלידים את מזהה העסק. לקוחות לא יוצאים מכאן לניהול.</p>
      <p className="mt-3 text-center text-2xl font-semibold tracking-[0.3em] tabular-nums" dir="ltr">{typed.padEnd(6, "·")}</p>
      {error ? <p className="mt-2 text-center text-sm text-copper">{error}</p> : null}
      <div className="mt-3 grid grid-cols-3 gap-2" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "מחק", "0"].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "מחק") setTyped("");
              else push(key);
            }}
            className="h-12 rounded-xl bg-paper font-semibold ring-1 ring-line"
          >
            {key}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
