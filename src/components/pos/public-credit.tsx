import { useEffect, useState } from "react";
import { code39Svg } from "@/lib/pos/code39";
import { formatILS, formatWhen } from "@/lib/pos/money";
import { qrSvg } from "@/lib/pos/qr";
import type { PublicCreditView } from "@/lib/pos/credits";

export function PublicCredit({ credit }: { credit: PublicCreditView | null }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!credit) return;
    setQr(qrSvg(credit.number));
  }, [credit]);
  if (!credit) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10 text-center">
        <h1 className="text-2xl font-semibold text-balance">השובר לא נמצא</h1>
        <p className="mt-3 text-sm text-pretty text-muted">אם קיבלתם אותו עכשיו, הוא יופיע אחרי שהקופה תתחבר לרשת.</p>
      </main>
    );
  }
  const status = credit.voided ? "בוטל" : credit.expired ? "פג תוקף" : credit.balance <= 0.001 ? "מומש" : "פעיל";
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <p className="text-sm text-muted">{credit.businessName || "שובר זיכוי"}</p>
      <h1 className="mt-1 text-3xl font-semibold tabular-nums" dir="ltr">{credit.number}</h1>
      <p className={`mt-2 text-sm font-medium ${status === "פעיל" ? "text-pine" : "text-copper"}`}>{status}</p>
      <dl className="mt-6 space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">סכום מקורי</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatILS(credit.original)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">יתרה</dt>
          <dd className="text-2xl font-semibold tabular-nums text-copper">{formatILS(credit.balance)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-muted">בתוקף עד</dt>
          <dd className="text-sm tabular-nums">{formatWhen(credit.expiresAt)}</dd>
        </div>
      </dl>
      <div className="mt-6 rounded-3xl bg-white p-4 text-center">
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: code39Svg(credit.number) }} />
        {qr ? <div className="mx-auto mt-4 w-44" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
        <p className="mt-3 text-sm text-muted">סורקים בקופה את הקוד או את הברקוד. מימוש חלקי מעדכן את היתרה.</p>
      </div>
    </main>
  );
}
