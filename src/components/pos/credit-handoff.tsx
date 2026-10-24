import { useState } from "react";
import { formatILS, formatWhen } from "@/lib/pos/money";
import { normalizeIsraeliMobile } from "@/lib/pos/phone";
import { deliverPrint, pulseDrawer } from "@/lib/pos/receipt-io";
import { saleHasCash, normalizePrintSettings } from "@/lib/pos/printer";
import { creditCloudId, creditSmsBody, creditUrl, selectCredits } from "@/lib/pos/credits";
import { deliverSms } from "@/lib/pos/sms";
import { usePos } from "@/lib/pos/store";
import { syncNow, useCloudStatus } from "@/lib/pos/sync";
import type { Sale } from "@/lib/pos/types";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function linkFor(businessId: string, creditId: string): Promise<string | null> {
  const ready = () => {
    const state = usePos.getState();
    const credit = selectCredits(state.credits).find((item) => item.id === creditId);
    const queued = state.outbox.some((doc) => doc.id === creditCloudId(businessId, creditId));
    if (!credit?.token || queued) return null;
    return creditUrl(credit.token);
  };
  const immediate = ready();
  if (immediate) return immediate;
  const started = Date.now();
  while (Date.now() - started < 4000) {
    await syncNow().catch(() => undefined);
    const url = ready();
    if (url) return url;
    const phase = useCloudStatus.getState().phase;
    if (phase === "offline" || phase === "local" || phase === "error" || phase === "revoked") break;
    await sleep(250);
  }
  return ready();
}

export function CreditHandoff({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const credits = usePos((state) => selectCredits(state.credits));
  const businessId = usePos((state) => state.activeStoreId);
  const notes = credits.filter((credit) => credit.saleId === sale.id);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function printNote() {
    const settings = normalizePrintSettings(usePos.getState().settings);
    const cash = saleHasCash(sale);
    if (cash && settings.openDrawer) {
      usePos.getState().openDrawer();
      await pulseDrawer();
    }
    await deliverPrint(sale, { kick: Boolean(cash && settings.openDrawer) });
  }

  async function sendSms() {
    const to = normalizeIsraeliMobile(phone);
    if (!to) {
      setMessage("צריך מספר נייד ישראלי.");
      return;
    }
    const bodies: string[] = [];
    for (const credit of notes) {
      const url = await linkFor(businessId, credit.id);
      bodies.push(creditSmsBody(credit, url));
    }
    await deliverSms({ to, body: bodies.join("\n\n"), saleId: sale.id });
    setMessage(bodies.some((body) => body.includes("/c/")) ? "נפתחה הודעת SMS עם קישור לשובר." : "נפתחה הודעה. הקישור לשובר יעבוד אחרי הסנכרון.");
  }

  async function hand(mode: "print" | "sms" | "both") {
    setBusy(true);
    setMessage("");
    try {
      if (mode !== "sms") await printNote();
      if (mode !== "print") await sendSms();
      if (mode === "print") setMessage("השובר נשלח להדפסה.");
    } catch {
      setMessage("לא הצלחנו להשלים את השליחה.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-paper p-3 ring-1 ring-line">
      <h3 className="text-base font-semibold">שובר זיכוי דיגיטלי</h3>
      <p className="mt-1 text-sm text-muted">מודפס, SMS, או שניהם. הסריקה בקופה משתמשת בקוד הקצר.</p>
      <ul className="mt-3 space-y-2">
        {notes.map((credit) => (
          <li key={credit.id} className="text-sm">
            <span className="font-semibold tabular-nums" dir="ltr">{credit.number}</span>
            <span> · {formatILS(credit.balance)} · בתוקף עד {formatWhen(credit.expiresAt)}</span>
          </li>
        ))}
      </ul>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-muted">נייד ל-SMS</span>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" dir="ltr" className="h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line" />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([
          ["print", "מודפס"],
          ["sms", "SMS"],
          ["both", "שניהם"],
        ] as const).map(([mode, label]) => (
          <button key={mode} type="button" disabled={busy} onClick={() => void hand(mode)} className="min-h-12 rounded-xl bg-pine px-2 text-sm font-semibold text-pine-ink disabled:opacity-50">
            {label}
          </button>
        ))}
      </div>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
      <button type="button" onClick={onClose} className="mt-2 min-h-12 w-full rounded-xl bg-surface text-sm ring-1 ring-line">
        סגירה
      </button>
    </div>
  );
}
