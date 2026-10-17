import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Banknote, CreditCard, IdCard, Minus, Pause, Plus, Printer, Search, Smartphone, Ticket, Trash2, Wallet, X } from "lucide-react";
import { Numpad } from "@/components/pos/numpad";
import { ReceiptView } from "@/components/pos/receipt";
import { SendReceipt } from "@/components/pos/send-sms";
import { confirmReceipt, deliverPrint, pulseDrawer } from "@/lib/pos/receipt-io";
import { computeTotals, formatILS, formatWhen, moneyFromPad, pushMoneyKey, roundCash, roundMoney } from "@/lib/pos/money";
import { foldTenders, previewTender, remainingExact, type TenderInput } from "@/lib/pos/tender";
import { currentUser, isWeekLocked, usePos } from "@/lib/pos/store";
import { chargeTerminal, deviceLabel, isSafeIpv4, MAX_PAYMENTS, paymentPlan } from "@/lib/pos/terminal";
import { METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod, type Product, type Sale, type TerminalKind } from "@/lib/pos/types";

const METHOD_ICON = {
  cash: Banknote,
  card: CreditCard,
  club: IdCard,
  bit: Smartphone,
  paybox: Smartphone,
  transfer: ArrowLeftRight,
  voucher: Ticket,
} as const;

function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
        className="flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface text-ink shadow-none sm:max-w-xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="overlay-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-12 w-12 items-center justify-center rounded-full bg-paper">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-pane min-h-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}

function CartPanel({
  onClose,
  onPay,
  onCustom,
  onHeld,
}: {
  onClose?: () => void;
  onPay: () => void;
  onCustom: () => void;
  onHeld: () => void;
}) {
  const cart = usePos((state) => state.cart);
  const discount = usePos((state) => state.discount);
  const held = usePos((state) => state.held);
  const vatRate = usePos((state) => state.settings.vatRate);
  const setQty = usePos((state) => state.setQty);
  const removeLine = usePos((state) => state.removeLine);
  const setDiscount = usePos((state) => state.setDiscount);
  const holdCart = usePos((state) => state.holdCart);
  const clearCart = usePos((state) => state.clearCart);
  const totals = computeTotals(cart, discount, vatRate);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">הסל</h2>
          <p className="text-sm text-muted">{count === 0 ? "אין פריטים" : `${count} פריטים`}</p>
        </div>
        <div className="flex gap-2">
          {onClose ? (
            <button type="button" onClick={onClose} className="h-12 rounded-xl bg-paper px-3 text-sm font-medium">
              חזרה
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearCart}
            disabled={!cart.length}
            className="h-12 rounded-xl bg-paper px-3 text-sm font-medium disabled:opacity-40"
          >
            ניקוי
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">הסל ריק. בוחרים מוצר מהמדף, או מוסיפים פריט חופשי.</p>
        ) : (
          <ul className="space-y-3">
            {cart.map((line) => (
              <li key={line.key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-sm tabular-nums text-muted">{formatILS(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="הפחתה"
                    onClick={() => setQty(line.key, line.qty - 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-paper"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-8 text-center text-base font-semibold tabular-nums">{line.qty}</span>
                  <button
                    type="button"
                    aria-label="הוספה"
                    onClick={() => setQty(line.key, line.qty + 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-paper"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <span className="w-20 text-end text-sm font-semibold tabular-nums">{formatILS(roundMoney(line.unitPrice * line.qty))}</span>
                <button type="button" aria-label="הסרת פריט" onClick={() => removeLine(line.key)} className="flex h-12 w-12 items-center justify-center rounded-full text-copper">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 space-y-3 border-t border-line px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {[5, 10, 15].map((percent) => {
            const active = discount?.kind === "percent" && discount.value === percent;
            return (
              <button
                key={percent}
                type="button"
                onClick={() => setDiscount(active ? null : { kind: "percent", value: percent })}
                className={`h-12 rounded-full px-3 text-sm ${active ? "bg-copper text-pine-ink" : "bg-copper-soft text-copper"}`}
              >
                {percent}%
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDiscount(discount?.kind === "amount" && discount.value === 5 ? null : { kind: "amount", value: 5 })}
            className={`h-12 rounded-full px-3 text-sm ${discount?.kind === "amount" && discount.value === 5 ? "bg-copper text-pine-ink" : "bg-copper-soft text-copper"}`}
          >
            ₪5
          </button>
          <button type="button" onClick={onCustom} className="h-12 rounded-full bg-paper px-3 text-sm">
            פריט חופשי
          </button>
        </div>
        <div className="space-y-1 text-sm">
          {totals.discountAmount > 0 ? (
            <div className="flex justify-between text-muted">
              <span>הנחה</span>
              <span className="tabular-nums">{formatILS(totals.discountAmount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted">
            <span>מתוכם מע״מ {vatRate}%</span>
            <span className="tabular-nums">{formatILS(totals.vat)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-medium">לתשלום</span>
            <span className="text-2xl font-semibold tabular-nums text-copper">{formatILS(totals.total)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              holdCart();
              onClose?.();
            }}
            disabled={!cart.length}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-paper text-sm font-medium disabled:opacity-40"
          >
            <Pause className="size-4" />
            השהיה
          </button>
          <button
            type="button"
            onClick={onHeld}
            className="flex h-12 items-center justify-center rounded-2xl bg-paper text-sm font-medium"
          >
            מושהות {held.length > 0 ? `(${held.length})` : ""}
          </button>
        </div>
        <button
          type="button"
          onClick={onPay}
          disabled={!cart.length || totals.total <= 0}
          className="h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40"
        >
          תשלום
        </button>
      </div>
    </div>
  );
}

function PaySheet({ onClose, onDone }: { onClose: () => void; onDone: (sale: Sale) => void }) {
  const cart = usePos((state) => state.cart);
  const discount = usePos((state) => state.discount);
  const settings = usePos((state) => state.settings);
  const nextReceipt = usePos((state) => state.nextReceipt);
  const lastGoodSync = usePos((state) => state.lastGoodSync);
  const appliedReleaseAt = usePos((state) => state.appliedReleaseAt);
  const checkout = usePos((state) => state.checkout);
  const totals = computeTotals(cart, discount, settings.vatRate);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [pad, setPad] = useState("");
  const [payments, setPayments] = useState(1);
  const [device, setDevice] = useState<TerminalKind>("android");
  const [phase, setPhase] = useState<"idle" | "wait" | "fail">("idle");
  const [message, setMessage] = useState("");
  const [inputs, setInputs] = useState<TenderInput[]>([]);
  const [manual, setManual] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const folded = foldTenders(Math.max(totals.total, 0.01), inputs);
  const taken = folded?.tenders ?? [];
  const remaining = totals.total > 0 ? (folded?.remaining ?? totals.total) : 0;
  const cashDue = roundCash(remaining);
  const slice = pad === "" ? (method === "cash" ? cashDue : remaining) : moneyFromPad(pad);
  const draft = remaining > 0.001 ? previewTender(remaining, { method, tendered: slice, payments }) : null;
  const draftCloses = Boolean(draft && remainingExact(totals.total, [...taken, draft]) <= 0.001);
  const plan = paymentPlan(draft?.amount || remaining, payments);
  const ready = {
    android: isSafeIpv4(settings.androidTerminal.ip),
    pinpad: isSafeIpv4(settings.pinpad.ip),
  };
  const endpoint = device === "android" ? settings.androidTerminal : settings.pinpad;
  const deviceReady = ready[device];
  const tooSmall = plan.count > 1 && plan.rest < 1;

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function closeWith(next: TenderInput[]) {
    const sale = checkout({ tenders: next });
    if (!sale) {
      setMessage("היתרה עוד לא כוסתה.");
      return;
    }
    onDone(sale);
  }

  function pushDraft(extra?: Partial<TenderInput>) {
    const input: TenderInput = {
      method,
      tendered: slice,
      payments,
      terminal: method === "card" || method === "club" ? device : null,
      ...extra,
    };
    const nextInputs = [...inputs, input];
    const next = foldTenders(totals.total, nextInputs);
    if (!next) {
      setMessage("הסכום גדול מהיתרה.");
      return;
    }
    setInputs(nextInputs);
    setPad("");
    setPayments(1);
    setMessage("");
    setPhase("idle");
    if (next.remaining <= 0.001) closeWith(nextInputs);
  }

  async function sendToTerminal() {
    if (!deviceReady || tooSmall || phase === "wait" || !draft) return;
    if (isWeekLocked(lastGoodSync, appliedReleaseAt)) {
      setPhase("fail");
      setMessage("הקופה נעולה עד שחרור בלוח הבקרה.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("wait");
    setMessage("");
    const result = await chargeTerminal({
      endpoint,
      amount: slice,
      payments: plan.count,
      method: method === "club" ? "club" : "credit",
      receipt: nextReceipt,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    abortRef.current = null;
    if (!result.ok) {
      setPhase("fail");
      setMessage(result.message);
      return;
    }
    pushDraft({
      tendered: slice,
      payments: plan.count,
      terminal: device,
      authCode: result.auth,
      cardLast4: result.last4,
      cardBrand: result.brand,
    });
  }

  function recordManual() {
    const auth = manual.trim();
    if (auth.length < 4) return;
    pushDraft({ authCode: auth, terminal: deviceReady ? device : null, payments: plan.count });
  }

  return (
    <Overlay
      title="תשלום"
      onClose={() => {
        abortRef.current?.abort();
        onClose();
      }}
    >
      <p className="text-center text-sm text-muted">יתרה · כולל מע״מ {settings.vatRate}%</p>
      <p className="mt-1 text-center text-4xl font-semibold tabular-nums text-copper">{formatILS(remaining)}</p>
      <p className="mt-1 text-center text-sm text-muted">סכום החשבון {formatILS(totals.total)}</p>
      {taken.length ? (
        <ul className="mt-3 space-y-2">
          {taken.map((line, index) => (
            <li key={`${line.method}-${index}`} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                {METHOD_LABEL[line.method]}
                {line.change > 0 ? ` · עודף ${formatILS(line.change)}` : ""}
              </span>
              <span className="font-semibold tabular-nums">{formatILS(line.amount)}</span>
              {index === taken.length - 1 && remaining > 0.001 ? (
                <button type="button" onClick={() => setInputs((current) => current.slice(0, -1))} className="h-12 rounded-xl px-3 text-copper">
                  הסרה
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {remaining > 0.001 ? (
      <div className="mt-4 grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((item) => {
          const Icon = METHOD_ICON[item];
          const active = method === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setMethod(item);
                setPhase("idle");
                setMessage("");
                setPad("");
              }}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs ${active ? "bg-pine text-pine-ink" : "bg-paper text-ink ring-1 ring-line"}`}
            >
              <Icon className="size-4" />
              {METHOD_LABEL[item]}
            </button>
          );
        })}
      </div>
      ) : null}
      {remaining <= 0.001 ? (
        <button type="button" onClick={() => closeWith(inputs)} className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink">
          סיום
        </button>
      ) : method === "cash" ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-paper px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">התקבל</span>
              <span className="text-2xl font-semibold tabular-nums">{pad === "" ? formatILS(cashDue) : formatILS(moneyFromPad(pad))}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="text-muted">{(draft?.change ?? 0) > 0 ? "עודף" : "ליתרה"}</span>
              <span className="font-semibold tabular-nums text-pine">{formatILS(draft?.change ?? 0)}</span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <button type="button" onClick={() => setPad(String(cashDue))} className="h-12 rounded-xl bg-pine-soft text-sm font-medium text-pine">
              מדויק
            </button>
            {[20, 50, 100, 200].map((bill) => (
              <button key={bill} type="button" onClick={() => setPad(String(bill))} className="h-12 rounded-xl bg-paper text-sm font-semibold ring-1 ring-line">
                {bill}
              </button>
            ))}
          </div>
          <Numpad onKey={(key) => setPad((current) => pushMoneyKey(current, key))} />
          <p className="text-center text-xs text-muted">אפשר לחלק לכמה אמצעים. עודף מחושב רק על המזומן, והוא מעוגל לעשר אגורות.</p>
          {message ? <p className="text-center text-sm text-copper">{message}</p> : null}
          <button
            type="button"
            disabled={!draft}
            onClick={() => pushDraft()}
            className="h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40"
          >
            {draftCloses ? "אישור ופתיחת מגירה" : "הוספת מזומן"}
          </button>
        </div>
      ) : method === "card" || method === "club" ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["android", "pinpad"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDevice(kind)}
                className={`h-14 rounded-2xl text-sm ${device === kind ? "bg-pine font-semibold text-pine-ink" : "bg-paper ring-1 ring-line"}`}
              >
                {deviceLabel(kind)}
                <span className="mt-0.5 block text-xs font-normal opacity-80">{ready[kind] ? "מוגדר" : "בלי כתובת"}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-3 py-2">
            <button
              type="button"
              aria-label="פחות תשלומים"
              disabled={payments <= 1 || phase === "wait"}
              onClick={() => setPayments((current) => Math.max(1, current - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-xl disabled:opacity-40"
            >
              −
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{plan.count === 1 ? "חיוב אחד" : `${plan.count} תשלומים`}</p>
              <p className="text-xs text-muted">
                {plan.count === 1
                  ? "בלי פריסה"
                  : plan.first === plan.rest
                    ? `${formatILS(plan.rest)} כל תשלום`
                    : `ראשון ${formatILS(plan.first)} · ואז ${formatILS(plan.rest)}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="עוד תשלומים"
              disabled={payments >= MAX_PAYMENTS || phase === "wait"}
              onClick={() => setPayments((current) => Math.min(MAX_PAYMENTS, current + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-xl disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className="text-center text-xs text-muted">
            {deviceReady ? `נשלח אל ${endpoint.ip}:${endpoint.port}` : "המנהל מגדיר את כתובת המסוף בהגדרות. אותה כתובת צריכה להיות גם במכשיר עצמו."}
          </p>
          {tooSmall ? <p className="text-center text-sm text-copper">כל תשלום צריך להיות לפחות שקל.</p> : null}
          {message ? <p className="text-center text-sm text-copper">{message}</p> : null}
          {phase === "wait" ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="h-14 w-full rounded-2xl bg-paper text-lg font-semibold ring-1 ring-line"
            >
              ממתינים למסוף… ביטול
            </button>
          ) : (
            <button
              type="button"
              disabled={!deviceReady || tooSmall || !draft}
              onClick={() => void sendToTerminal()}
              className="h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40"
            >
              שליחה ל{deviceLabel(device)}
            </button>
          )}
          {phase === "fail" ? (
            <div className="space-y-2">
              <label className="block text-sm text-muted">
                אם יצא אישור במסוף, רושמים את המספר
                <input
                  value={manual}
                  onChange={(event) => setManual(event.target.value.replace(/[^\d]/g, "").slice(0, 8))}
                  inputMode="numeric"
                  dir="ltr"
                  className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
                />
              </label>
              <button type="button" disabled={manual.trim().length < 4} onClick={recordManual} className="h-12 w-full rounded-2xl bg-paper text-sm font-medium ring-1 ring-line disabled:opacity-40">
                רישום האישור
              </button>
            </div>
          ) : null}
          <button type="button" disabled={!draft} onClick={() => pushDraft()} className="h-12 w-full rounded-2xl bg-paper text-sm font-semibold ring-1 ring-line disabled:opacity-40">
            {draftCloses ? "סגירה בלי מסוף" : "הוספת הסכום בלי מסוף"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-center text-sm text-muted">שדה ריק מחייב את כל היתרה, {formatILS(remaining)}.</p>
          <Numpad onKey={(key) => setPad((current) => pushMoneyKey(current, key))} />
          {message ? <p className="text-center text-sm text-copper">{message}</p> : null}
          <button type="button" disabled={!draft} onClick={() => pushDraft()} className="h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40">
            {draftCloses ? `סיום ב${METHOD_LABEL[method]}` : `הוספת ${METHOD_LABEL[method]}`}
          </button>
        </div>
      )}
    </Overlay>
  );
}

function DoneSheet({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  useEffect(() => {
    void confirmReceipt(sale);
  }, [sale]);

  return (
    <Overlay title={`קבלה ${sale.number}`} onClose={onClose}>
      <ReceiptView sale={sale} />
      <button
        type="button"
        onClick={() => void deliverPrint(sale)}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-paper px-3 py-2 text-sm font-medium ring-1 ring-line"
      >
        <Printer className="size-4 shrink-0" />
        הדפסה
      </button>
      <SendReceipt sale={sale} />
      <button type="button" onClick={onClose} className="mt-2 min-h-14 w-full rounded-2xl bg-pine px-3 text-lg font-semibold text-pine-ink">
        מכירה חדשה
      </button>
    </Overlay>
  );
}

function CustomSheet({ onClose }: { onClose: () => void }) {
  const addCustomItem = usePos((state) => state.addCustomItem);
  const [name, setName] = useState("כללי");
  const [pad, setPad] = useState("");
  const price = moneyFromPad(pad);

  return (
    <Overlay title="פריט חופשי" onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">שם</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
      </label>
      <p className="mt-4 text-center text-3xl font-semibold tabular-nums">{formatILS(price)}</p>
      <div className="mt-3">
        <Numpad onKey={(key) => setPad((current) => pushMoneyKey(current, key))} />
      </div>
      <button
        type="button"
        disabled={!name.trim() || price <= 0}
        onClick={() => {
          addCustomItem(name, price);
          onClose();
        }}
        className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-pine-ink disabled:opacity-40"
      >
        הוספה לסל
      </button>
    </Overlay>
  );
}

function HeldSheet({ onClose }: { onClose: () => void }) {
  const held = usePos((state) => state.held);
  const vatRate = usePos((state) => state.settings.vatRate);
  const resumeHeld = usePos((state) => state.resumeHeld);
  const discardHeld = usePos((state) => state.discardHeld);

  return (
    <Overlay title="סלים מושהים" onClose={onClose}>
      {held.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">אין סלים ממתינים. אפשר להשהות סל פעיל ולחזור אליו.</p>
      ) : (
        <ul className="space-y-3">
          {held.map((order) => {
            const totals = computeTotals(order.lines, order.discount, vatRate);
            return (
              <li key={order.id} className="rounded-2xl bg-paper p-3 ring-1 ring-line">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted">{formatWhen(order.createdAt)}</span>
                  <span className="font-semibold tabular-nums">{formatILS(totals.total)}</span>
                </div>
                <p className="mt-1 text-sm">{order.lines.map((line) => `${line.name} ×${line.qty}`).join(" · ")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resumeHeld(order.id);
                      onClose();
                    }}
                    className="h-12 rounded-xl bg-pine text-sm font-semibold text-pine-ink"
                  >
                    החזרה לסל
                  </button>
                  <button type="button" onClick={() => discardHeld(order.id)} className="h-12 rounded-xl bg-surface text-sm text-copper ring-1 ring-line">
                    מחיקה
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Overlay>
  );
}

function shelfProducts(products: Product[], query: string, shelf: "upper" | "lower") {
  const q = query.trim();
  return products.filter((product) => {
    if (!product.active || product.shelf !== shelf) return false;
    if (!q) return true;
    return product.name.includes(q) || product.sku.includes(q);
  });
}

function ShelfTile({ product, qty, onAdd }: { product: Product; qty: number; onAdd: () => void }) {
  const remaining = product.trackStock ? product.stock - qty : null;
  const out = remaining !== null && remaining <= 0;
  return (
    <button
      type="button"
      disabled={out}
      onClick={onAdd}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface text-start ring-1 ring-line transition-transform duration-150 active:scale-95 disabled:opacity-50"
    >
      <span className="relative block aspect-[5/4] max-h-40 w-full overflow-hidden bg-pine-soft">
        {product.image ? (
          <img src={product.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl font-semibold text-pine">{product.name.slice(0, 1)}</span>
        )}
        {qty > 0 ? (
          <span className="absolute end-1.5 top-1.5 rounded-full bg-pine px-2 text-xs font-semibold text-pine-ink tabular-nums">{qty}</span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2 py-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</span>
        <span className="text-sm font-semibold tabular-nums text-copper">{formatILS(product.price)}</span>
      </span>
    </button>
  );
}

export function SalePage() {
  const products = usePos((state) => state.products);
  const cart = usePos((state) => state.cart);
  const discount = usePos((state) => state.discount);
  const vatRate = usePos((state) => state.settings.vatRate);
  const businessName = usePos((state) => state.settings.businessName);
  const sales = usePos((state) => state.sales);
  const user = usePos(currentUser);
  const openDrawer = usePos((state) => state.openDrawer);
  const lock = usePos((state) => state.lock);
  const addProductToCart = usePos((state) => state.addProductToCart);
  const addCustomItem = usePos((state) => state.addCustomItem);
  const removeLine = usePos((state) => state.removeLine);
  const setQty = usePos((state) => state.setQty);
  const holdCart = usePos((state) => state.holdCart);
  const resumeHeld = usePos((state) => state.resumeHeld);
  const held = usePos((state) => state.held);
  const setDiscount = usePos((state) => state.setDiscount);
  const logo = usePos((state) => state.settings.logo);
  const markKiosk = usePos((state) => state.markKiosk);
  const [query, setQuery] = useState("");
  const [pad, setPad] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const [note, setNote] = useState("");

  const totals = computeTotals(cart, discount, vatRate);
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  const dateLabel = new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      if (!line.productId) continue;
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.qty);
    }
    return map;
  }, [cart]);

  const upper = useMemo(() => shelfProducts(products, query, "upper"), [products, query]);
  const lower = useMemo(() => shelfProducts(products, query, "lower"), [products, query]);
  const incoming = useMemo(
    () => sales.filter((sale) => sale.channel === "kiosk" && sale.kioskStatus === "new" && !sale.voided).slice(0, 3),
    [sales],
  );

  const addByQuery = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return false;
      const active = products.filter((product) => product.active);
      const bySku = active.find((product) => product.sku === q);
      if (bySku) {
        const ok = addProductToCart(bySku);
        if (!ok) setNote(`${bySku.name} אזל מהמלאי.`);
        return ok;
      }
      const matches = active.filter((product) => product.name.includes(q));
      if (matches.length === 1) {
        const ok = addProductToCart(matches[0]);
        if (!ok) setNote(`${matches[0].name} אזל מהמלאי.`);
        return ok;
      }
      return false;
    },
    [products, addProductToCart],
  );

  useEffect(() => {
    let buffer = "";
    let timer = 0;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "Enter") {
        if (buffer && addByQuery(buffer)) setQuery("");
        buffer = "";
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        buffer += event.key;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          buffer = "";
        }, 80);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addByQuery]);

  const drawer = useCallback(async () => {
    openDrawer();
    const result = await pulseDrawer();
    setNote(result === "sent" ? "נשלח פולס למגירה." : "הפתיחה נרשמה. אין חיבור USB — פותחים את המגירה ידנית.");
  }, [openDrawer]);

  const lastReceipt = useCallback(() => {
    const sale = sales.find((item) => !item.voided);
    if (!sale) {
      setNote("אין קבלה להדפסה.");
      return;
    }
    void deliverPrint(sale);
  }, [sales]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F4") {
        event.preventDefault();
        void drawer();
      } else if (event.key === "F8") {
        event.preventDefault();
        lastReceipt();
      } else if (event.key === "F2" && count > 0) {
        event.preventDefault();
        setPayOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer, lastReceipt, count]);

  const amount = moneyFromPad(pad);

  function addAmount() {
    if (amount <= 0) {
      setNote("מקלידים סכום, למשל 45.50, ואז הוסף.");
      return;
    }
    addCustomItem("מוצר כללי", amount);
    setPad("");
    setSelectedKey(null);
    setNote("");
  }

  function deleteLine() {
    const key = selectedKey && cart.some((line) => line.key === selectedKey) ? selectedKey : cart[cart.length - 1]?.key;
    if (!key) return;
    removeLine(key);
    setSelectedKey(null);
  }

  return (
    <>
    <div className="register-frame">
    <div className="register">
      <section aria-label="מדף עליון" className="register-panel register-upper bg-paper ring-1 ring-line">
        <div className="flex shrink-0 items-center gap-2 px-2 pt-2">
          {logo ? (
            <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pine text-sm font-bold text-pine-ink">₪</span>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">מדף עליון</h2>
        </div>
        <div className="relative mx-2 mt-2 shrink-0">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (addByQuery(query)) setQuery("");
            }}
            placeholder="חיפוש או מק״ט"
            aria-label="חיפוש מוצר או מק״ט"
            autoComplete="off"
            className="h-12 w-full rounded-xl bg-surface ps-9 pe-2 text-sm ring-1 ring-line"
          />
        </div>
        <ShelfGrid
          products={upper}
          empty="אין מוצרים במדף העליון. במוצרים בוחרים מדף עליון."
          qtyByProduct={qtyByProduct}
          onAdd={(product) => {
            if (!addProductToCart(product)) setNote(`${product.name} אזל מהמלאי.`);
          }}
        />
      </section>

      <section aria-label="חשבון נוכחי" className="register-panel register-ticket bg-surface ring-1 ring-line">
        <header className="shrink-0 px-2 pt-2">
          <h1 className="truncate text-base font-semibold">{businessName}</h1>
          <p className="truncate text-xs text-muted">
            {dateLabel}
            {user ? ` · ${user.name}` : ""}
          </p>
        </header>
        <div className="grid shrink-0 grid-cols-3 gap-2 px-2 pt-2">
          <button
            type="button"
            disabled={!cart.length || held.length >= 5}
            onClick={() => {
              if (!holdCart()) setNote(held.length >= 5 ? "אפשר להקפיא עד 5 חשבונות." : "אין מה להקפיא.");
            }}
            className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-paper px-1 py-1 text-center text-xs font-medium leading-tight ring-1 ring-line disabled:opacity-40"
          >
            <Pause className="size-4 shrink-0" />
            הקפאה {held.length}/5
          </button>
          <button type="button" onClick={() => void drawer()} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-paper px-1 py-1 text-center text-xs font-medium leading-tight ring-1 ring-line">
            <Wallet className="size-4 shrink-0" />
            מגירה
          </button>
          <button type="button" onClick={lastReceipt} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-paper px-1 py-1 text-center text-xs font-medium leading-tight ring-1 ring-line">
            <Printer className="size-4 shrink-0" />
            קבלה
          </button>
        </div>
        {note ? <p className="shrink-0 truncate px-2 pt-1 text-xs text-muted">{note}</p> : null}
        {incoming.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto px-2 pt-2">
            {incoming.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => markKiosk(sale.id, "done")}
                className="h-12 shrink-0 rounded-full bg-copper-soft px-3 text-xs font-medium text-copper"
              >
                קיוסק {sale.number} · {formatILS(sale.amountDue)} · טופל
              </button>
            ))}
          </div>
        ) : null}
        {held.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto px-2 pt-2">
            {held.map((order, index) => (
              <button
                key={order.id}
                type="button"
                onClick={() => resumeHeld(order.id)}
                className="h-12 shrink-0 rounded-full bg-pine-soft px-3 text-xs font-medium text-pine"
              >
                מוקפא {index + 1} · {formatILS(computeTotals(order.lines, order.discount, vatRate).total)}
              </button>
            ))}
          </div>
        ) : null}
        <ul className="scroll-pane min-h-0 flex-1 px-2 py-1">
          {cart.length === 0 ? (
            <li className="py-4 text-center text-xs text-muted">החשבון ריק. בוחרים מהמדף, או מוסיפים מוצר כללי בסכום.</li>
          ) : (
            cart.map((line) => (
              <li key={line.key}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(line.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelectedKey(line.key);
                  }}
                  className={`mb-1 flex w-full flex-wrap items-center gap-2 rounded-xl px-1.5 py-1 text-start ${selectedKey === line.key ? "bg-pine-soft" : "bg-paper"}`}
                >
                  <span className="min-w-0 flex-1 basis-24 truncate text-sm font-medium">{line.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatILS(roundMoney(line.unitPrice * line.qty))}</span>
                  <span className="ms-auto flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="הפחתה"
                      onClick={(event) => {
                        event.stopPropagation();
                        setQty(line.key, line.qty - 1);
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-surface"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-5 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
                    <button
                      type="button"
                      aria-label="הוספה"
                      onClick={(event) => {
                        event.stopPropagation();
                        setQty(line.key, line.qty + 1);
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-surface"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="shrink-0 space-y-1 border-t border-line px-2 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {[5, 10, 15].map((percent) => {
              const active = discount?.kind === "percent" && discount.value === percent;
              return (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setDiscount(active ? null : { kind: "percent", value: percent })}
                  className={`h-12 shrink-0 rounded-full px-3 text-xs ${active ? "bg-copper text-pine-ink" : "bg-copper-soft text-copper"}`}
                >
                  {percent}%
                </button>
              );
            })}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">לתשלום · מע״מ {vatRate}%</span>
            <span className="text-lg font-semibold tabular-nums text-copper">{formatILS(totals.total)}</span>
          </div>
        </div>
      </section>

      <section aria-label="מדף תחתון" className="register-panel register-lower bg-paper ring-1 ring-line">
        <h2 className="shrink-0 px-2 pt-2 text-sm font-semibold">מדף תחתון</h2>
        <ShelfGrid
          products={lower}
          empty="אין מוצרים במדף התחתון. במוצרים בוחרים מדף תחתון."
          qtyByProduct={qtyByProduct}
          onAdd={(product) => {
            if (!addProductToCart(product)) setNote(`${product.name} אזל מהמלאי.`);
          }}
        />
      </section>

      <section aria-label="סכום עצמאי ותשלום" className="register-panel register-keypad bg-surface ring-1 ring-line">
        <div className="keypad-fit">
          <div className="keypad-stack">
            <p className="shrink-0 text-center text-xl font-semibold leading-none tabular-nums" dir="ltr">
              {pad === "" ? "0.00" : pad}
            </p>
            <Numpad fill onKey={(key) => setPad((current) => pushMoneyKey(current, key))} />
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <button type="button" onClick={addAmount} className="min-h-12 rounded-xl bg-pine px-2 text-sm font-semibold text-pine-ink">
                הוסף
              </button>
              <button
                type="button"
                onClick={deleteLine}
                disabled={!cart.length}
                className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-copper-soft px-2 text-sm font-semibold leading-tight text-copper disabled:opacity-40"
              >
                <Trash2 className="size-4 shrink-0" />
                מחק שורה
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              disabled={!cart.length || totals.total <= 0}
              className="min-h-14 shrink-0 rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-40"
            >
              תשלום
            </button>
          </div>
        </div>
      </section>
    </div>
    </div>
    {payOpen ? (
      <PaySheet
        onClose={() => setPayOpen(false)}
        onDone={(sale) => {
          setPayOpen(false);
          setDone(sale);
        }}
      />
    ) : null}
    {done ? <DoneSheet sale={done} onClose={() => setDone(null)} /> : null}
    </>
  );
}

function ShelfGrid({
  products,
  empty,
  qtyByProduct,
  onAdd,
}: {
  products: Product[];
  empty: string;
  qtyByProduct: Map<string, number>;
  onAdd: (product: Product) => void;
}) {
  return (
    <div className="scroll-pane min-h-0 flex-1 p-2">
      {products.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">{empty}</p>
      ) : (
        <div className="shelf-grid">
          {products.map((product) => (
            <ShelfTile key={product.id} product={product} qty={qtyByProduct.get(product.id) ?? 0} onAdd={() => onAdd(product)} />
          ))}
        </div>
      )}
    </div>
  );
}
