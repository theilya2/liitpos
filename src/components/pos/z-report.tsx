import { formatDay, formatILS } from "@/lib/pos/money";
import { METHOD_LABEL, type ZReport } from "@/lib/pos/types";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-lg font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function ZReportView({ report }: { report: ZReport }) {
  return (
    <article className="receipt-sheet mx-auto w-full max-w-sm bg-surface px-5 py-6 text-ink">
      <header className="text-center">
        <p className="text-sm text-muted">דוח Z</p>
        <h2 className="text-xl font-semibold">{report.storeName}</h2>
        <p className="mt-1 text-sm font-semibold">מספר {report.number}</p>
        <p className="text-sm text-muted">{formatDay(report.closedAt)}</p>
        <p className="text-sm text-muted">נסגר על ידי {report.closedBy || "—"}</p>
      </header>
      <div className="my-4 border-t border-dashed border-line" />
      <div className="space-y-1">
        <Row label="עסקאות" value={String(report.salesCount)} />
        <Row label="ביטולים" value={String(report.voidCount)} />
        <Row label="מחזור" value={formatILS(report.turnover)} strong />
        <Row label="מע״מ" value={formatILS(report.vat)} />
        <Row label="לפני מע״מ" value={formatILS(report.net)} />
      </div>
      <div className="my-4 border-t border-dashed border-line" />
      <div className="space-y-1">
        {report.byMethod.map((row) => (
          <Row key={row.method} label={METHOD_LABEL[row.method]} value={formatILS(row.total)} />
        ))}
      </div>
      <div className="my-4 border-t border-dashed border-line" />
      <div className="space-y-1">
        <Row label="יתרת פתיחה" value={formatILS(report.openingFloat)} />
        <Row label="מזומן שהתקבל" value={formatILS(report.cashTaken)} />
        <Row label="צפוי במגירה" value={formatILS(report.cashExpected)} />
        <Row label="נספר בפועל" value={formatILS(report.cashCounted)} />
        <Row label="הפרש" value={formatILS(report.variance)} strong />
        <Row label="נשאר למחר" value={formatILS(report.leftInDrawer)} />
        <Row label="פתיחות מגירה" value={String(report.drawerOpens)} />
      </div>
      <p className="mt-4 text-center text-xs text-muted">מ-{formatDay(report.from)} עד {formatDay(report.to)}. הדוח סוגר את המשמרת.</p>
    </article>
  );
}
