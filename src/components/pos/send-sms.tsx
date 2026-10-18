import { useState } from "react";
import { MessageSquare, Share2 } from "lucide-react";
import { shareReceipt, shareStatus } from "@/lib/pos/receipt-io";
import { formatIsraeliMobile, matchClubMember, normalizeIsraeliMobile } from "@/lib/pos/phone";
import { receiptSmsBody, receiptUrl, saleCloudId } from "@/lib/pos/receipt-link";
import { deliverSms } from "@/lib/pos/sms";
import { syncNow, useCloudStatus } from "@/lib/pos/sync";
import { usePos } from "@/lib/pos/store";
import type { Sale } from "@/lib/pos/types";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function publishedUrl(businessId: string, saleId: string): string | null {
  const state = usePos.getState();
  const sale = state.sales.find((item) => item.id === saleId);
  const queued = state.outbox.some((doc) => doc.id === saleCloudId(businessId, saleId));
  if (!sale?.publicToken || queued) return null;
  return receiptUrl(sale.publicToken);
}

async function linkAfterSync(businessId: string, saleId: string): Promise<string | null> {
  const ready = publishedUrl(businessId, saleId);
  if (ready) return ready;
  const started = Date.now();
  while (Date.now() - started < 4000) {
    await syncNow().catch(() => undefined);
    const url = publishedUrl(businessId, saleId);
    if (url) return url;
    const phase = useCloudStatus.getState().phase;
    if (phase === "offline" || phase === "local" || phase === "error") break;
    await sleep(250);
  }
  return publishedUrl(businessId, saleId);
}

export function SendReceipt({ sale }: { sale: Sale }) {
  const members = usePos((state) => state.members);
  const saveMember = usePos((state) => state.saveMember);
  const attachReceiptToken = usePos((state) => state.attachReceiptToken);
  const businessId = usePos((state) => state.activeStoreId);
  const [phone, setPhone] = useState("");
  const [savePhone, setSavePhone] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [shared, setShared] = useState("");
  const [busy, setBusy] = useState(false);
  const normalized = normalizeIsraeliMobile(phone);
  const match = normalized ? matchClubMember(members ?? [], normalized) : null;
  const canonical = normalized ? formatIsraeliMobile(normalized) : "";
  const canSave = Boolean(match && match.phone.replace(/\s/g, "") !== canonical);
  const offline = useCloudStatus((state) => state.phase === "offline");

  async function send() {
    const to = normalizeIsraeliMobile(phone);
    if (!to) {
      setError("צריך מספר נייד ישראלי, למשל 052-1234567.");
      setNote("");
      return;
    }
    setError("");
    setBusy(true);
    try {
      attachReceiptToken(sale.id);
      const current = usePos.getState().sales.find((item) => item.id === sale.id) ?? sale;
      const url = await linkAfterSync(businessId, sale.id);
      if (canSave && savePhone && match) saveMember({ ...match, phone: formatIsraeliMobile(to) });
      await deliverSms({ to, body: receiptSmsBody(current, url), saleId: sale.id });
      setNote(url ? "נפתחה הודעת SMS עם קישור לקבלה." : "נפתחה הודעה בלי קישור. הקישור לקבלה המלאה יעבוד אחרי הסנכרון.");
    } catch {
      setError("לא הצלחנו לפתוח את הודעות ה-SMS.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label className="block text-sm text-muted">
        מספר נייד
        <input
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setError("");
          }}
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="05X-XXXXXXX"
          aria-label="מספר נייד לשליחה ב-SMS"
          className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
        />
      </label>
      {canSave && match ? (
        <label className="flex min-h-12 items-center gap-2 text-sm text-pretty">
          <input type="checkbox" checked={savePhone} onChange={(event) => setSavePhone(event.target.checked)} className="size-6 shrink-0" />
          לעדכן את הטלפון של {match.firstName} {match.lastName} במועדון
        </label>
      ) : null}
      {offline ? <p className="text-sm text-pretty text-muted">אין רשת. ההודעה תישלח בלי קישור, והקישור יעבוד אחרי הסנכרון.</p> : null}
      {error ? <p className="text-sm text-pretty text-copper">{error}</p> : null}
      <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-pine px-3 py-2 text-center text-sm font-semibold leading-tight text-pine-ink disabled:opacity-50">
        <MessageSquare className="size-4 shrink-0" />
        {busy ? "פותחים הודעה…" : "שליחה ב-SMS"}
      </button>
      {note ? <p className="text-sm text-pretty text-muted">{note}</p> : null}
      <button
        type="button"
        onClick={() => void shareReceipt(sale).then((result) => setShared(shareStatus(result)))}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-paper px-3 py-2 text-center text-sm leading-tight ring-1 ring-line"
      >
        <Share2 className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{shared || "שיתוף"}</span>
      </button>
    </form>
  );
}
