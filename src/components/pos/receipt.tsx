import { formatILS, formatWhen } from "@/lib/pos/money";
import { tendersOf } from "@/lib/pos/tender";
import { deviceLabel } from "@/lib/pos/terminal";
import { METHOD_LABEL, type Sale, type TenderLine } from "@/lib/pos/types";

function tenderText(line: TenderLine): string {
  const parts = [METHOD_LABEL[line.method] ?? "תשלום"];
  if (line.terminal) parts.push(deviceLabel(line.terminal));
  if ((line.payments ?? 1) > 1) parts.push(`${line.payments} תשלומים`);
  if (line.voucherCode) parts.push(line.voucherCode);
  return parts.join(" · ");
}

export function receiptPlainText(sale: Sale): string {
  const credit = sale.kind === "credit";
  const tenders = tendersOf(sale);
  const lines = [
    sale.business.businessName,
    sale.business.ownerName,
    `עוסק מורשה ${sale.business.taxId}`,
    sale.business.address,
    sale.business.phone,
    "",
    credit ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`,
    credit && sale.creditOfNumber ? `עבור קבלה ${sale.creditOfNumber}` : "",
    sale.cashierName ? `קופאי ${sale.cashierName}` : "",
    sale.channel === "kiosk" ? "הזמנת קיוסק" : "",
    formatWhen(sale.createdAt),
    sale.voided ? "מבוטלת" : "",
    "",
    ...sale.lines.map((line) => `${line.name}  x${line.qty}  ${formatILS(line.lineTotal)}`),
    "",
    sale.discountAmount > 0 ? `הנחה  ${formatILS(sale.discountAmount)}` : "",
    `${credit ? "זיכוי" : "לתשלום"}  ${formatILS(sale.total)}`,
    `מתוכם מע״מ ${sale.vatRate}%  ${formatILS(sale.vatAmount)}`,
    sale.rounding !== 0 ? `עיגול מזומן  ${formatILS(sale.rounding)}` : "",
    ...tenders.map((line) => `${credit ? "הוחזר" : "שולם"} ב${tenderText(line)}  ${formatILS(line.amount)}${line.change > 0 ? `  עודף ${formatILS(line.change)}` : ""}`),
    sale.authCode ? `אישור  ${sale.authCode}` : "",
    sale.cardLast4 ? `כרטיס  ****${sale.cardLast4}${sale.cardBrand ? ` ${sale.cardBrand}` : ""}` : "",
    "",
    sale.business.receiptFooter,
    "קבלה פנימית. אינה חשבונית מס.",
  ];
  return lines.filter((line) => line !== "").join("\n");
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-lg font-semibold" : "text-sm"}`}>
      <span className={`min-w-0 break-words ${strong ? "" : "text-muted"}`}>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

export function ReceiptView({ sale }: { sale: Sale }) {
  const credit = sale.kind === "credit";
  const tenders = tendersOf(sale);
  return (
    <article className="receipt-sheet mx-auto w-full max-w-sm bg-surface px-4 py-6 text-ink sm:px-5">
      <header className="text-center">
        <h2 className="text-xl font-semibold">{sale.business.businessName}</h2>
        <p className="mt-1 text-sm">{sale.business.ownerName}</p>
        <p className="text-sm text-muted">עוסק מורשה {sale.business.taxId}</p>
        <p className="text-sm text-muted">{sale.business.address}</p>
        <p className="text-sm text-muted" dir="ltr">
          {sale.business.phone}
        </p>
      </header>
      <div className="my-4 border-t border-dashed border-line" />
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{credit ? `תעודת זיכוי ${sale.number}` : `קבלה ${sale.number}`}</span>
        <span className="tabular-nums text-muted">{formatWhen(sale.createdAt)}</span>
      </div>
      {credit && sale.creditOfNumber ? <p className="mt-1 text-sm text-muted">עבור קבלה {sale.creditOfNumber}</p> : null}
      {sale.cashierName ? <p className="mt-1 text-sm text-muted">קופאי {sale.cashierName}</p> : null}
      {sale.channel === "kiosk" ? <p className="mt-1 text-sm font-medium text-pine">הזמנת קיוסק</p> : null}
      {sale.voided ? <p className="mt-2 text-center text-sm font-semibold text-copper">קבלה מבוטלת</p> : null}
      <ul className="mt-4 space-y-2">
        {sale.lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">
              {line.name}
              <span className="text-muted"> × {line.qty}</span>
            </span>
            <span className="shrink-0 tabular-nums">{formatILS(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="my-4 border-t border-dashed border-line" />
      <div className="space-y-1">
        {sale.discountAmount > 0 ? <Row label="הנחה" value={formatILS(sale.discountAmount)} /> : null}
        <Row label={credit ? "זיכוי" : "לתשלום"} value={formatILS(sale.total)} strong />
        <Row label={`מתוכם מע״מ ${sale.vatRate}%`} value={formatILS(sale.vatAmount)} />
        <Row label="לפני מע״מ" value={formatILS(sale.net)} />
        {sale.rounding !== 0 ? <Row label="עיגול מזומן" value={formatILS(sale.rounding)} /> : null}
        {tenders.map((line, index) => (
          <Row key={`${line.method}-${index}`} label={tenderText(line)} value={formatILS(line.amount)} />
        ))}
        {sale.authCode ? <Row label="מספר אישור" value={sale.authCode} /> : null}
        {sale.cardLast4 ? <Row label="כרטיס" value={`****${sale.cardLast4}${sale.cardBrand ? ` ${sale.cardBrand}` : ""}`} /> : null}
        {tenders.some((line) => line.change > 0) ? <Row label="עודף" value={formatILS(sale.change)} /> : null}
        {tenders.filter((line) => line.voucherCode).map((line) => (
          <Row key={line.voucherCode} label="שובר זיכוי" value={line.voucherCode ?? ""} />
        ))}
      </div>
      <p className="mt-5 text-center text-sm">{sale.business.receiptFooter}</p>
      <p className="mt-3 text-center text-xs text-muted">קבלה פנימית לניהול הקופה. אינה חשבונית מס ואינה מחליפה דיווח לרשות המסים.</p>
    </article>
  );
}
