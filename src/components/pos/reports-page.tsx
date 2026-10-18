import { useMemo, useState } from "react";
import { PageHeader } from "@/components/pos/shell";
import { can } from "@/lib/pos/access";
import { formatILS, formatWhen, roundMoney } from "@/lib/pos/money";
import { soldItems, stockRows } from "@/lib/pos/options";
import { currentUser, usePos } from "@/lib/pos/store";
import { isCredit, zFigures } from "@/lib/pos/tender";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/pos/types";

type Range = "shift" | "today" | "week" | "all";

function inRange(iso: string, range: Range): boolean {
  if (range === "all" || range === "shift") return true;
  const time = new Date(iso).getTime();
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return time >= start.getTime();
  }
  return time >= now.getTime() - 7 * 24 * 3600_000;
}

const RANGES: { id: Range; label: string }[] = [
  { id: "shift", label: "משמרת" },
  { id: "today", label: "היום" },
  { id: "week", label: "7 ימים" },
  { id: "all", label: "הכל" },
];

export function ReportsPage() {
  const sales = usePos((state) => state.sales);
  const products = usePos((state) => state.products);
  const openingFloat = usePos((state) => state.settings.openingFloat);
  const zReports = usePos((state) => state.zReports);
  const drawerOpens = usePos((state) => state.drawerOpens);
  const user = usePos(currentUser);
  const closeZ = usePos((state) => state.closeZ);
  const queueZPrint = usePos((state) => state.queueZPrint);
  const [range, setRange] = useState<Range>("shift");
  const [counted, setCounted] = useState("");
  const [left, setLeft] = useState("");
  const [zError, setZError] = useState("");

  const pool = useMemo(
    () => sales.filter((sale) => (range === "shift" ? !sale.zId : inRange(sale.createdAt, range))),
    [sales, range],
  );
  const figures = useMemo(() => zFigures(pool), [pool]);
  const liveSales = pool.filter((sale) => !sale.voided && !isCredit(sale));
  const kioskCount = liveSales.filter((sale) => sale.channel === "kiosk").length;
  const kioskTurnover = roundMoney(liveSales.filter((sale) => sale.channel === "kiosk").reduce((sum, sale) => sum + sale.amountDue, 0));
  const maxMethod = Math.max(...figures.byMethod.map((row) => Math.abs(row.total)), 1);

  const hours = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const sale of pool) {
      if (sale.voided) continue;
      const date = new Date(sale.createdAt);
      const key = `${String(date.getHours()).padStart(2, "0")}:00`;
      const signed = isCredit(sale) ? -sale.amountDue : sale.amountDue;
      buckets.set(key, roundMoney((buckets.get(key) ?? 0) + signed));
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, total]) => ({ hour, total: Math.max(0, total) }));
  }, [pool]);
  const maxHour = Math.max(...hours.map((row) => row.total), 1);
  const shortages = stockRows(products).filter((row) => row.stock <= row.lowStock);
  const sold = useMemo(() => soldItems(pool), [pool]);
  const mayClose = !!user && can(user.role, "z");

  function submitZ() {
    const cashCounted = Number(counted.replace(",", "."));
    const leftInDrawer = Number((left || counted).replace(",", "."));
    if (!Number.isFinite(cashCounted) || cashCounted < 0) {
      setZError("צריך ספירת מזומן.");
      return;
    }
    const report = closeZ(cashCounted, Number.isFinite(leftInDrawer) ? leftInDrawer : cashCounted);
    if (!report) {
      setZError("אין מכירות פתוחות במשמרת.");
      return;
    }
    setCounted("");
    setLeft("");
    setZError("");
    requestAnimationFrame(() => window.print());
  }

  return (
    <div className="scroll-pane page-sheet min-h-0 flex-1">
      <PageHeader title="דוח קופה" subtitle="משמרת פתוחה, סוף יום ודוח Z. זה דוח ניהול, לא דוח מס." />
      <div className="space-y-3 px-3 pb-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`h-12 whitespace-nowrap rounded-full px-2 text-sm ${range === item.id ? "bg-pine font-semibold text-pine-ink" : "bg-surface ring-1 ring-line"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <section className="grid grid-cols-2 gap-2">
          <Stat label="עסקאות" value={String(figures.salesCount)} />
          <Stat label="מחזור נטו" value={formatILS(figures.turnover)} accent />
          <Stat label="לפני מע״מ" value={formatILS(figures.net)} />
          <Stat label="זיכויים" value={String(figures.creditCount)} />
        </section>
        {kioskCount > 0 ? (
          <p className="text-sm text-muted">
            מהקיוסק: {kioskCount} הזמנות · {formatILS(kioskTurnover)}. הן כלולות במחזור וב-Z.
          </p>
        ) : null}
        {range === "shift" || range === "today" ? (
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-base font-semibold">{range === "shift" ? "מגירה במשמרת" : "מגירת מזומן"}</h2>
            <Row label="יתרת פתיחה" value={formatILS(openingFloat)} />
            <Row label="מזומן נטו" value={formatILS(figures.cashTaken)} />
            {figures.cashRefunds > 0 ? <Row label="החזר מזומן" value={formatILS(figures.cashRefunds)} /> : null}
            <Row label="צפוי במגירה" value={formatILS(roundMoney(openingFloat + figures.cashTaken))} strong />
            {range === "shift" ? <Row label="פתיחות מגירה" value={String(drawerOpens.length)} /> : null}
            <p className="mt-2 text-xs text-muted">הצפוי הוא יתרת הפתיחה ועוד מזומן מהמכירות. סופרים את המגירה לפני סגירת Z.</p>
          </section>
        ) : null}
        {range === "shift" && mayClose ? (
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="text-base font-semibold">סגירת משמרת · דוח Z</h2>
            <p className="mt-1 text-sm text-muted">הסגירה נועלת את כל הקבלות שעדיין לא נכנסו ל-Z, ומעבירה את מה שנשאר במגירה ליתרת הפתיחה הבאה.</p>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">מזומן שנספר</span>
              <input value={counted} onChange={(event) => setCounted(event.target.value)} inputMode="decimal" dir="ltr" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">נשאר במגירה למשמרת הבאה</span>
              <input value={left} onChange={(event) => setLeft(event.target.value)} inputMode="decimal" dir="ltr" placeholder={counted || "כמו הספירה"} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums" />
            </label>
            {zError ? <p className="mt-2 text-sm text-copper">{zError}</p> : null}
            <button type="button" onClick={submitZ} disabled={figures.salesCount + figures.creditCount === 0} className="mt-3 h-12 w-full rounded-2xl bg-pine font-semibold text-pine-ink disabled:opacity-40">
              סגירה והדפסת Z
            </button>
          </section>
        ) : null}
        {figures.rounding !== 0 ? (
          <p className="text-sm text-muted">עיגול מזומן מצטבר בטווח: {formatILS(figures.rounding)}</p>
        ) : null}
        {figures.voidCount > 0 ? <p className="text-sm text-muted">{figures.voidCount} קבלות מבוטלות לא נכללות.</p> : null}
        {figures.creditTotal > 0 ? <p className="text-sm text-muted">זיכויים בטווח: {formatILS(figures.creditTotal)}. המחזור למעלה כבר אחרי הניכוי.</p> : null}
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">לפי שעה</h2>
          {hours.length === 0 ? (
            <p className="py-6 text-sm text-muted">אין מכירות בטווח הזה.</p>
          ) : (
            <div className="mt-4 flex h-40 items-end gap-2" dir="ltr">
              {hours.map((row) => (
                <div key={row.hour} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                  <div className="rounded-t-lg bg-pine" style={{ height: `${Math.max(8, (row.total / maxHour) * 100)}%` }} />
                  <span className="text-center text-xs text-muted tabular-nums">{row.hour.slice(0, 2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">לפי אמצעי תשלום</h2>
          {figures.byMethod.length === 0 ? (
            <p className="py-6 text-sm text-muted">אין תנועות.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {figures.byMethod.map((row) => (
                <li key={row.method}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>
                      {METHOD_LABEL[row.method as PaymentMethod]}
                      {row.refunds > 0 ? ` · זיכוי ${formatILS(row.refunds)}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">{formatILS(row.total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-pine-soft">
                    <div className="h-full rounded-full bg-pine" style={{ width: `${(row.total / maxMethod) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">נמכר</h2>
          {sold.length === 0 ? (
            <p className="py-4 text-sm text-muted">אין שורות בטווח הזה.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sold.slice(0, 12).map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{row.name}</span>
                  <span className="shrink-0 tabular-nums">{row.qty} · {formatILS(row.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">חוסרים במלאי</h2>
          {shortages.length === 0 ? (
            <p className="py-4 text-sm text-muted">אין פריטים מתחת לסף.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shortages.slice(0, 8).map((row) => (
                <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0 font-medium text-copper tabular-nums">{row.stock}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">דוחות Z</h2>
          {zReports.length === 0 ? (
            <p className="py-4 text-sm text-muted">עדיין לא נסגרה משמרת.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {zReports.slice(0, 8).map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Z {report.number}</span>
                    <span className="text-xs text-muted">{formatWhen(report.closedAt)} · {report.closedBy}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      queueZPrint(report);
                      requestAnimationFrame(() => window.print());
                    }}
                    className="h-12 shrink-0 rounded-xl bg-surface px-3 text-sm ring-1 ring-line"
                  >
                    הדפסה
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-copper" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`mt-2 flex items-baseline justify-between gap-3 ${strong ? "text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
