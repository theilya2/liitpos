import { useMemo, useState } from "react";
import { formatRegisterTime } from "@/lib/pos/register";
import {
  attendanceCsv,
  attendanceReport,
  formatDuration,
  jerusalemDayKey,
  jerusalemMonth,
  jerusalemParts,
  jerusalemWallToUtc,
  monthLabel,
  PUNCH_LABEL,
  shiftMonth,
} from "@/lib/pos/timeclock";
import type { PunchKind, TimePunch } from "@/lib/pos/types";

type Editor = { ok: boolean; message: string };

type Props = {
  punches: TimePunch[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
  onCorrect?: (id: string, atIso: string, why: string) => Editor | Promise<Editor>;
  onAdd?: (staffId: string, kind: PunchKind, atIso: string, why: string) => Editor | Promise<Editor>;
  onVoid?: (id: string, why: string) => Editor | Promise<Editor>;
};

function downloadCsv(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function wallIso(day: string, time: string): string | null {
  const [y, m, d] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!y || !m || !d || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(jerusalemWallToUtc(y, m, d, hour, minute)).toISOString();
}

export function AttendanceReport({ punches, staff, canEdit, onCorrect, onAdd, onVoid }: Props) {
  const [month, setMonth] = useState(() => jerusalemMonth());
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [why, setWhy] = useState("");
  const [adding, setAdding] = useState(false);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [kind, setKind] = useState<PunchKind>("out");
  const reports = useMemo(() => attendanceReport(punches, month), [punches, month]);
  const listed = punches
    .filter((punch) => {
      const at = Date.parse(punch.at);
      return Number.isFinite(at) && jerusalemMonth(at) === month;
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  async function run(work: () => Editor | Promise<Editor>) {
    const result = await work();
    setMessage(result.message);
    if (result.ok) {
      setEditId(null);
      setWhy("");
      setAdding(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">שעון נוכחות</h2>
          <p className="mt-1 text-sm text-muted">שעות לפי שעון ירושלים. חריגה מעל 8.6 שעות ביום או 42 שעות בשבוע מסומנת בנפרד.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(`attendance-${month}.csv`, attendanceCsv(reports))}
          className="min-h-12 rounded-xl bg-paper px-3 text-sm font-medium ring-1 ring-line"
        >
          ייצוא CSV
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth((current) => shiftMonth(current, -1))} className="min-h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
          חודש קודם
        </button>
        <p className="text-sm font-semibold">{monthLabel(month)}</p>
        <button type="button" onClick={() => setMonth((current) => shiftMonth(current, 1))} className="min-h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
          חודש הבא
        </button>
      </div>
      {reports.length === 0 ? <p className="py-4 text-sm text-muted">אין רישומי נוכחות בחודש הזה.</p> : null}
      <div className="mt-3 space-y-3">
        {reports.map((row) => (
          <article key={row.staffId} className="rounded-2xl bg-paper p-3 ring-1 ring-line">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{row.staffName}</h3>
              <p className="text-sm tabular-nums">{row.days.length} ימים · {formatDuration(row.totalMs)}</p>
            </div>
            {row.dailyExcessMs > 0 ? <p className="mt-1 text-sm text-copper">חריגה יומית מעל 8.6: {formatDuration(row.dailyExcessMs)}</p> : null}
            {row.weeklyExcessMs > 0 ? <p className="mt-1 text-sm text-copper">חריגה שבועית מעל 42: {formatDuration(row.weeklyExcessMs)}</p> : null}
            <ul className="mt-2 space-y-1">
              {row.days.map((item) => (
                <li key={item.day} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    {item.day}
                    {item.open ? " · משמרת פתוחה" : ""}
                    {item.dailyOt ? " · מעל 8.6" : ""}
                  </span>
                  <span className="tabular-nums">{formatDuration(item.ms)}</span>
                </li>
              ))}
            </ul>
            {row.weeks.filter((week) => week.weeklyOt).map((week) => (
              <p key={week.weekStart} className="mt-1 text-xs text-copper">
                שבוע {week.weekStart}: {formatDuration(week.ms)} · מעל 42
              </p>
            ))}
          </article>
        ))}
      </div>
      {listed.length ? (
        <ul className="mt-4 space-y-2">
          {listed.map((punch) => (
            <li key={punch.id} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={punch.voided ? "text-muted line-through" : "font-medium"}>
                  {punch.staffName} · {PUNCH_LABEL[punch.kind]} · {formatRegisterTime(punch.at)}
                </span>
                <span className="text-xs text-muted">{punch.registerNo ? `קופה ${punch.registerNo}` : "בלי מספר קופה"}</span>
              </div>
              {punch.originalAt !== punch.at ? <p className="text-xs text-muted">מקור: {formatRegisterTime(punch.originalAt)}</p> : null}
              {punch.added ? <p className="text-xs text-muted">נוסף על ידי {punch.added.byName} · {punch.added.why}</p> : null}
              {punch.edits.map((edit, index) => (
                <p key={`${edit.at}-${index}`} className="text-xs text-muted">
                  תיקון {formatRegisterTime(edit.at)} · {edit.byName} · {edit.why}
                </p>
              ))}
              {canEdit && !punch.voided ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const at = Date.parse(punch.at);
                      const parts = jerusalemParts(at);
                      setEditId(punch.id);
                      setDay(jerusalemDayKey(at));
                      setTime(`${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`);
                      setWhy("");
                      setMessage("");
                    }}
                    className="min-h-12 rounded-xl bg-surface px-3 text-sm ring-1 ring-line"
                  >
                    תיקון
                  </button>
                  <button type="button" onClick={() => { setEditId(`void:${punch.id}`); setWhy(""); setMessage(""); }} className="min-h-12 rounded-xl bg-surface px-3 text-sm text-copper ring-1 ring-line">
                    ביטול רישום
                  </button>
                </div>
              ) : null}
              {editId === punch.id && onCorrect ? (
                <form
                  className="mt-2 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const atIso = wallIso(day, time);
                    if (!atIso) { setMessage("צריך תאריך ושעה"); return; }
                    void run(() => onCorrect(punch.id, atIso, why));
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={day} onChange={(event) => setDay(event.target.value)} required className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line" />
                    <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line" />
                  </div>
                  <input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="למה מתקנים" className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line" />
                  <button type="submit" className="min-h-12 rounded-xl bg-pine text-sm font-semibold text-pine-ink">שמירת התיקון</button>
                </form>
              ) : null}
              {editId === `void:${punch.id}` && onVoid ? (
                <form
                  className="mt-2 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() => onVoid(punch.id, why));
                  }}
                >
                  <input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="למה מבטלים" className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line" />
                  <button type="submit" className="min-h-12 rounded-xl bg-copper text-sm font-semibold text-pine-ink">ביטול עם סיבה</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit && onAdd ? (
        <div className="mt-4">
          {adding ? (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const atIso = wallIso(day, time);
                if (!atIso) { setMessage("צריך תאריך ושעה"); return; }
                void run(() => onAdd(staffId, kind, atIso, why));
              }}
            >
              <p className="text-sm font-medium">הוספת ניקוב חסר</p>
              <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line">
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
              <select value={kind} onChange={(event) => setKind(event.target.value as PunchKind)} className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line">
                {(Object.keys(PUNCH_LABEL) as PunchKind[]).map((item) => (
                  <option key={item} value={item}>{PUNCH_LABEL[item]}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={day} onChange={(event) => setDay(event.target.value)} required className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line" />
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line" />
              </div>
              <input value={why} onChange={(event) => setWhy(event.target.value)} placeholder="למה חסר הרישום" className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line" />
              <button type="submit" className="min-h-12 rounded-xl bg-pine text-sm font-semibold text-pine-ink">שמירה</button>
            </form>
          ) : (
            <button type="button" onClick={() => { setAdding(true); setDay(month + "-01"); setTime("08:00"); setWhy(""); }} className="min-h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
              הוספת ניקוב חסר
            </button>
          )}
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
