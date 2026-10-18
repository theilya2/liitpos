import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { OptionSheet } from "@/components/pos/option-sheet";
import { canSeeStore } from "@/lib/pos/access";
import { attractImages, kioskTiming, upsellSuggestions } from "@/lib/pos/kiosk";
import { formatILS, roundCash, roundMoney } from "@/lib/pos/money";
import { setKioskLock } from "@/lib/pos/native";
import { hasEnough, needsPicker, shelfPrice } from "@/lib/pos/options";
import { pricedOrPlain } from "@/lib/pos/promo";
import { confirmReceipt } from "@/lib/pos/receipt-io";
import { usePos } from "@/lib/pos/store";
import { chargeTerminal, deviceLabel, paymentPlan, terminalOrigin } from "@/lib/pos/terminal";
import type { CartLine, Product, TenderMethod, TerminalKind } from "@/lib/pos/types";

type Pick = Product;

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
  const [attract, setAttract] = useState(true);
  const [review, setReview] = useState(false);
  const [warnLeft, setWarnLeft] = useState<number | null>(null);
  const sales = usePos((state) => state.sales);
  const staff = usePos((state) => state.staff);
  const activeStoreId = usePos((state) => state.activeStoreId);
  const navigate = useNavigate();
  const totals = pricedOrPlain(cart, products, settings.promos, null, settings.vatRate);
  const timing = kioskTiming(settings);
  const slides = attractImages(settings, products);
  const [slide, setSlide] = useState(0);
  const idleAt = useRef(Date.now());
  const suggestions = upsellSuggestions(cart, products, settings.upsellRules, sales);

  function bump() {
    idleAt.current = Date.now();
    setWarnLeft(null);
  }

  useEffect(() => {
    if (!timing.lock) return;
    setKioskLock(true);
    return () => setKioskLock(false);
  }, [timing.lock]);

  useEffect(() => {
    if (!attract || slides.length < 2) return;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 4000);
    return () => window.clearInterval(timer);
  }, [attract, slides.length]);

  useEffect(() => {
    if (attract) return;
    const timer = window.setInterval(() => {
      if ((Date.now() - idleAt.current) / 1000 >= timing.idle) setWarnLeft((current) => current ?? timing.warn);
    }, 500);
    return () => window.clearInterval(timer);
  }, [attract, timing.idle, timing.warn]);

  useEffect(() => {
    if (warnLeft === null) return;
    if (warnLeft <= 0) {
      setCart([]);
      setPick(null);
      setPay(false);
      setReview(false);
      setDone(null);
      setAttract(true);
      setWarnLeft(null);
      return;
    }
    const timer = window.setTimeout(() => setWarnLeft((current) => (current === null ? null : current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [warnLeft]);

  function taken(productId: string, variantId: string | null) {
    return cart
      .filter((line) => line.productId === productId && (line.variantId ?? null) === variantId)
      .reduce((sum, line) => sum + line.qty, 0);
  }

  return (
    <main className="kiosk-board relative flex min-h-0 flex-1 flex-col bg-paper text-ink" onPointerDown={bump}>
      <header className="relative z-40 flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
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
      <div className="scroll-pane min-h-0 flex-1 p-3">
        {menu.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">התפריט עדיין ריק. בעל העסק מסמן מוצרים כ״מופיע בקיוסק״.</p>
        ) : (
          <div className="kiosk-grid">
            {menu.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setPick(product)}
                className="overflow-hidden rounded-3xl bg-surface text-start ring-1 ring-line transition-transform duration-150 active:scale-95"
              >
                <span className="block aspect-[4/3] max-h-56 overflow-hidden bg-pine-soft">
                  {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-3xl font-semibold text-pine">{product.name.slice(0, 1)}</span>}
                </span>
                <span className="block px-3 py-3">
                  <span className="block text-base font-semibold">{product.name}</span>
                  <span className="mt-1 block text-sm font-semibold tabular-nums text-copper">{shelfPrice(product).from ? `מ־${formatILS(shelfPrice(product).amount)}` : formatILS(shelfPrice(product).amount)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        {totals.promoAmount > 0 ? (
          <p className="mb-2 truncate text-center text-sm text-pine">מבצע {totals.promoLabel} · {formatILS(totals.promoAmount)}</p>
        ) : null}
        <button
          type="button"
          disabled={!cart.length}
          onClick={() => setReview(true)}
          className="flex h-14 w-full items-center justify-between rounded-2xl bg-pine px-4 text-lg font-semibold text-pine-ink disabled:opacity-40"
        >
          <span>לתשלום</span>
          <span className="tabular-nums">{formatILS(totals.total)}</span>
        </button>
      </div>
      {attract ? (
        <button
          type="button"
          onClick={() => {
            bump();
            setAttract(false);
          }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink text-pine-ink"
        >
          {slides[slide] ? <img src={slides[slide].image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
          <span className="relative mt-auto w-full bg-ink/55 px-6 py-8 text-center">
            <span className="block text-3xl font-semibold text-balance">{slides[slide]?.caption || settings.businessName}</span>
            <span className="mt-4 inline-flex min-h-14 items-center rounded-2xl bg-pine px-8 text-xl font-semibold">לחצו להזמנה</span>
          </span>
        </button>
      ) : null}
      {warnLeft !== null ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-surface p-6 text-center">
            <h2 className="text-2xl font-semibold">עדיין כאן?</h2>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{warnLeft}</p>
            <button type="button" onClick={bump} className="mt-4 min-h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink">
              כן, ממשיכים
            </button>
          </div>
        </div>
      ) : null}
      {review ? (
        <Sheet title="ההזמנה" onClose={() => setReview(false)}>
          <ul className="space-y-2">
            {cart.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">{line.name} × {line.qty}</span>
                <span className="shrink-0 tabular-nums">{formatILS(roundMoney(line.unitPrice * line.qty))}</span>
              </li>
            ))}
          </ul>
          {suggestions.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium">אולי גם</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {suggestions.map((product) => {
                  const price = shelfPrice(product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        if (needsPicker(product)) {
                          setPick(product);
                          return;
                        }
                        if (!hasEnough(product, null, taken(product.id, null) + 1)) return;
                        setCart((current) => [
                          ...current,
                          { key: `k_${crypto.randomUUID()}`, productId: product.id, name: product.name, unitPrice: product.price, qty: 1 },
                        ]);
                      }}
                      className="min-h-14 rounded-2xl bg-paper px-3 py-2 text-start text-sm ring-1 ring-line"
                    >
                      <span className="block font-medium">{product.name}</span>
                      <span className="tabular-nums text-copper">{price.from ? `מ־${formatILS(price.amount)}` : formatILS(price.amount)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {totals.promoAmount > 0 ? (
            <p className="mt-3 text-sm text-pine">מבצע {totals.promoLabel} · {formatILS(totals.promoAmount)}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setReview(false);
              setPay(true);
            }}
            className="mt-4 flex min-h-14 w-full items-center justify-between rounded-2xl bg-pine px-4 text-lg font-semibold text-pine-ink"
          >
            <span>לתשלום</span>
            <span className="tabular-nums">{formatILS(totals.total)}</span>
          </button>
        </Sheet>
      ) : null}
      {pick ? (
        <OptionSheet
          product={pick}
          taken={(variantId) => taken(pick.id, variantId)}
          onClose={() => setPick(null)}
          onAdd={(line) => {
            setCart((current) => [...current, { ...line, key: `k_${crypto.randomUUID()}` }]);
            setPick(null);
          }}
        />
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
          lock={timing.lock}
          accept={(value) => {
            if (!timing.lock) return value === settings.code;
            return staff.some((user) => user.active && user.role === "manager" && user.pin === value && canSeeStore(user, activeStoreId));
          }}
          onClose={() => setExitOpen(false)}
          onLeave={() => {
            setKioskLock(false);
            lock();
            void navigate({ to: "/" });
          }}
        />
      ) : null}
    </main>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
      <div role="dialog" aria-modal="true" className="kiosk-sheet scroll-pane max-h-full min-h-0 w-full max-w-lg rounded-t-3xl bg-surface p-4 text-ink sm:max-w-xl sm:rounded-3xl">
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
    void confirmReceipt(sale);
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
            void confirmReceipt(sale);
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

function ExitGate({
  lock,
  accept,
  onClose,
  onLeave,
}: {
  lock: boolean;
  accept: (value: string) => boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  const length = lock ? 4 : 6;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  function push(digit: string) {
    const next = (typed + digit).slice(0, length);
    setTyped(next);
    setError("");
    if (next.length === length) {
      if (accept(next)) onLeave();
      else {
        setTyped("");
        setError(lock ? "קוד המנהל לא מתאים." : "המזהה לא מתאים לעסק הזה.");
      }
    }
  }
  return (
    <Sheet title="יציאה מהקיוסק" onClose={onClose}>
      <p className="text-sm text-muted">
        {lock ? "נעילת הקיוסק פעילה. רק קוד מנהל משחרר אותה." : "מקלידים את מזהה העסק. לקוחות לא יוצאים מכאן לניהול."}
      </p>
      <p className="mt-3 text-center text-2xl font-semibold tracking-[0.3em] tabular-nums" dir="ltr">{typed.padEnd(length, "·")}</p>
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
