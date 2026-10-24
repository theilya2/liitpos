import { canSeeStore } from "@/lib/pos/access";
import type { PunchKind, StaffUser, TimePunch } from "@/lib/pos/types";

const EMPTY_PUNCHES: TimePunch[] = [];

export const DAY_LIMIT_MS = 8.6 * 3_600_000;
export const WEEK_LIMIT_MS = 42 * 3_600_000;

export const PUNCH_LABEL: Record<PunchKind, string> = {
  in: "כניסה",
  out: "יציאה",
  "break-start": "הפסקה",
  "break-end": "חזרה",
};

const KIND_ORDER: Record<PunchKind, number> = { in: 0, "break-start": 1, "break-end": 2, out: 3 };

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function selectPunches(punches: TimePunch[] | null | undefined): TimePunch[] {
  return punches ?? EMPTY_PUNCHES;
}

export function jerusalemParts(at: number): { y: number; m: number; d: number; hour: number; minute: number; second: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(bag.hour);
  return {
    y: Number(bag.year),
    m: Number(bag.month),
    d: Number(bag.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: WEEKDAY[bag.weekday] ?? 0,
  };
}

export function jerusalemDayKey(at: number): string {
  const p = jerusalemParts(at);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function jerusalemMonth(at = Date.now()): string {
  const p = jerusalemParts(at);
  return `${p.y}-${pad(p.m)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format(new Date(Date.UTC(y, (m || 1) - 1, 15)));
}

/** Offset of Asia/Jerusalem at `at`, in milliseconds (wall clock minus UTC). */
export function jerusalemOffsetMs(at: number): number {
  const p = jerusalemParts(at);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

export function nextJerusalemMidnight(at: number): number {
  const p = jerusalemParts(at);
  const nextWall = Date.UTC(p.y, p.m - 1, p.d + 1);
  let utc = nextWall - jerusalemOffsetMs(at);
  utc = nextWall - jerusalemOffsetMs(utc);
  if (utc <= at) utc += 3_600_000;
  return utc;
}

export function jerusalemWallToUtc(y: number, m: number, d: number, hour: number, minute: number): number {
  const wall = Date.UTC(y, m - 1, d, hour, minute, 0);
  let utc = wall - jerusalemOffsetMs(wall);
  utc = wall - jerusalemOffsetMs(utc);
  return utc;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export function weekStartKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, d || 1);
  const start = utc - new Date(utc).getUTCDay() * 86_400_000;
  const date = new Date(start);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function byTime(a: TimePunch, b: TimePunch): number {
  return a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

export function shiftStatus(punches: TimePunch[], staffId: string): "out" | "in" | "break" {
  let status: "out" | "in" | "break" = "out";
  for (const punch of punches.filter((item) => item.staffId === staffId && !item.voided).sort(byTime)) {
    if (punch.kind === "in") status = "in";
    else if (punch.kind === "out") status = "out";
    else if (punch.kind === "break-start" && status === "in") status = "break";
    else if (punch.kind === "break-end" && status === "break") status = "in";
  }
  return status;
}

export function clockActions(status: "out" | "in" | "break"): { kind: PunchKind; label: string }[] {
  if (status === "out") return [{ kind: "in", label: "כניסה" }];
  if (status === "break") return [
    { kind: "break-end", label: "חזרה מהפסקה" },
    { kind: "out", label: "יציאה" },
  ];
  return [
    { kind: "break-start", label: "יציאה להפסקה" },
    { kind: "out", label: "יציאה" },
  ];
}

type ClockInput = {
  punches: TimePunch[];
  staff: Pick<StaffUser, "id" | "name">;
  kind: PunchKind;
  at: string;
  registerNo: number | null;
  registerName: string;
  storeId: string;
  id: () => string;
};

function makePunch(input: ClockInput, kind: PunchKind): TimePunch {
  return {
    id: input.id(),
    staffId: input.staff.id,
    staffName: input.staff.name,
    kind,
    at: input.at,
    originalAt: input.at,
    registerNo: input.registerNo,
    registerName: input.registerName,
    storeId: input.storeId,
    voided: false,
    edits: [],
  };
}

export function applyClock(input: ClockInput): { ok: boolean; message: string; punches: TimePunch[] } {
  const status = shiftStatus(input.punches, input.staff.id);
  const name = input.staff.name;
  if (input.kind === "in" && status !== "out") return { ok: false, message: "כבר במשמרת", punches: input.punches };
  if (input.kind === "out" && status === "out") return { ok: false, message: "אין משמרת פתוחה", punches: input.punches };
  if (input.kind === "break-start" && status !== "in") {
    return { ok: false, message: status === "break" ? "כבר בהפסקה" : "אין משמרת פתוחה", punches: input.punches };
  }
  if (input.kind === "break-end" && status !== "break") return { ok: false, message: "לא בהפסקה", punches: input.punches };
  const extra = input.kind === "out" && status === "break" ? [makePunch(input, "break-end"), makePunch(input, "out")] : [makePunch(input, input.kind)];
  const label = input.kind === "in" ? "כניסה" : input.kind === "out" ? "יציאה" : input.kind === "break-start" ? "הפסקה" : "חזרה מהפסקה";
  return { ok: true, message: `${label} נרשמה ל${name}`, punches: [...input.punches, ...extra] };
}

export function clockByPin(input: {
  punches: TimePunch[];
  staff: StaffUser[];
  storeId: string;
  pin: string;
  kind: PunchKind;
  at: string;
  registerNo: number | null;
  registerName: string;
  id: () => string;
}): { ok: boolean; message: string; punches: TimePunch[] } {
  if (!input.storeId || input.storeId === "store-empty") return { ok: false, message: "אין עסק פעיל", punches: input.punches };
  const matches = input.staff.filter((user) => user.active && user.pin === input.pin && canSeeStore(user, input.storeId));
  if (!matches.length) return { ok: false, message: "קוד לא מוכר", punches: input.punches };
  if (matches.length > 1) return { ok: false, message: "הקוד משויך ליותר מעובד אחד", punches: input.punches };
  return applyClock({ ...input, staff: matches[0] });
}

function reasonOk(why: string): boolean {
  return why.trim().length >= 2;
}

export function applyPunchEdit(punch: TimePunch, edit: { atIso: string; why: string; byId: string; byName: string; editedAt: string }): TimePunch | null {
  const at = Date.parse(edit.atIso);
  if (!reasonOk(edit.why) || !Number.isFinite(at) || punch.voided) return null;
  return {
    ...punch,
    at: new Date(at).toISOString(),
    edits: [...punch.edits, { at: edit.editedAt, byId: edit.byId, byName: edit.byName, why: edit.why.trim().slice(0, 160), previousAt: punch.at }],
  };
}

export function voidPunchRecord(punch: TimePunch, edit: { why: string; byId: string; byName: string; editedAt: string }): TimePunch | null {
  if (!reasonOk(edit.why) || punch.voided) return null;
  return {
    ...punch,
    voided: true,
    edits: [...punch.edits, { at: edit.editedAt, byId: edit.byId, byName: edit.byName, why: edit.why.trim().slice(0, 160), previousAt: punch.at }],
  };
}

export function manualPunch(input: {
  staff: Pick<StaffUser, "id" | "name">;
  kind: PunchKind;
  atIso: string;
  why: string;
  byId: string;
  byName: string;
  editedAt: string;
  registerNo: number | null;
  registerName: string;
  storeId: string;
  id: string;
}): TimePunch | null {
  const at = Date.parse(input.atIso);
  if (!reasonOk(input.why) || !Number.isFinite(at)) return null;
  const iso = new Date(at).toISOString();
  return {
    id: input.id,
    staffId: input.staff.id,
    staffName: input.staff.name,
    kind: input.kind,
    at: iso,
    originalAt: iso,
    registerNo: input.registerNo,
    registerName: input.registerName,
    storeId: input.storeId,
    voided: false,
    edits: [],
    added: { at: input.editedAt, byId: input.byId, byName: input.byName, why: input.why.trim().slice(0, 160) },
  };
}

type Span = { start: number; end: number | null; breaks: { start: number; end: number | null }[] };

function sessionsOf(punches: TimePunch[]): Span[] {
  const spans: Span[] = [];
  let current: Span | null = null;
  let gap: { start: number; end: number | null } | null = null;
  for (const punch of punches.filter((item) => !item.voided).sort(byTime)) {
    const at = Date.parse(punch.at);
    if (!Number.isFinite(at)) continue;
    if (punch.kind === "in") {
      if (current && current.end == null) current.end = at;
      current = { start: at, end: null, breaks: [] };
      spans.push(current);
      gap = null;
    } else if (punch.kind === "out" && current && current.end == null) {
      if (gap && gap.end == null) gap.end = at;
      current.end = at;
      gap = null;
    } else if (punch.kind === "break-start" && current && current.end == null && !gap) {
      gap = { start: at, end: null };
      current.breaks.push(gap);
    } else if (punch.kind === "break-end" && gap && gap.end == null) {
      gap.end = at;
      gap = null;
    }
  }
  return spans;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function dayPieces(start: number, end: number, breaks: { start: number; end: number | null }[]): { day: string; ms: number }[] {
  const pieces: { day: string; ms: number }[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor < end && guard < 8) {
    guard += 1;
    const next = Math.min(end, nextJerusalemMidnight(cursor));
    if (next <= cursor) break;
    let ms = next - cursor;
    for (const gap of breaks) {
      const gapEnd = gap.end ?? end;
      ms -= overlap(cursor, next, gap.start, gapEnd);
    }
    pieces.push({ day: jerusalemDayKey(cursor), ms: Math.max(0, ms) });
    cursor = next;
  }
  return pieces;
}

export type AttendanceDay = {
  day: string;
  ms: number;
  open: boolean;
  dailyOt: boolean;
  excessMs: number;
};

export type AttendanceWeek = {
  weekStart: string;
  ms: number;
  weeklyOt: boolean;
  excessMs: number;
};

export type AttendanceStaff = {
  staffId: string;
  staffName: string;
  days: AttendanceDay[];
  weeks: AttendanceWeek[];
  totalMs: number;
  dailyExcessMs: number;
  weeklyExcessMs: number;
};

export function attendanceReport(punches: TimePunch[], month: string): AttendanceStaff[] {
  const byStaff = new Map<string, TimePunch[]>();
  for (const punch of punches) {
    const list = byStaff.get(punch.staffId) ?? [];
    list.push(punch);
    byStaff.set(punch.staffId, list);
  }
  const reports: AttendanceStaff[] = [];
  for (const [staffId, list] of byStaff) {
    const name = [...list].sort(byTime).at(-1)?.staffName || staffId;
    const dayMs = new Map<string, number>();
    const openDays = new Set<string>();
    for (const span of sessionsOf(list)) {
      if (span.end == null) {
        openDays.add(jerusalemDayKey(span.start));
        continue;
      }
      for (const piece of dayPieces(span.start, span.end, span.breaks)) {
        dayMs.set(piece.day, (dayMs.get(piece.day) ?? 0) + piece.ms);
      }
    }
    const weekMs = new Map<string, number>();
    for (const [day, ms] of dayMs) weekMs.set(weekStartKey(day), (weekMs.get(weekStartKey(day)) ?? 0) + ms);
    const days: AttendanceDay[] = [];
    for (const [day, ms] of dayMs) {
      if (!day.startsWith(month)) continue;
      const excessMs = Math.max(0, ms - DAY_LIMIT_MS);
      days.push({ day, ms, open: openDays.has(day), dailyOt: ms > DAY_LIMIT_MS, excessMs });
    }
    for (const day of openDays) {
      if (!day.startsWith(month) || days.some((row) => row.day === day)) continue;
      days.push({ day, ms: 0, open: true, dailyOt: false, excessMs: 0 });
    }
    days.sort((a, b) => a.day.localeCompare(b.day));
    const weekKeys = new Set(days.map((row) => weekStartKey(row.day)));
    const weeks: AttendanceWeek[] = [...weekKeys].sort().map((weekStart) => {
      const ms = weekMs.get(weekStart) ?? 0;
      return { weekStart, ms, weeklyOt: ms > WEEK_LIMIT_MS, excessMs: Math.max(0, ms - WEEK_LIMIT_MS) };
    });
    if (!days.length && ![...openDays].some((day) => day.startsWith(month))) continue;
    reports.push({
      staffId,
      staffName: name,
      days,
      weeks,
      totalMs: days.reduce((sum, row) => sum + row.ms, 0),
      dailyExcessMs: days.reduce((sum, row) => sum + row.excessMs, 0),
      weeklyExcessMs: weeks.reduce((sum, row) => sum + row.excessMs, 0),
    });
  }
  return reports.sort((a, b) => a.staffName.localeCompare(b.staffName, "he"));
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function attendanceCsv(reports: AttendanceStaff[]): string {
  const lines = ["עובד,תאריך,שעות,חריגה יומית מעל 8.6,עודף יומי,שבוע,שעות שבוע,חריגה שבועית מעל 42,עודף שבועי,משמרת פתוחה"];
  for (const staff of reports) {
    const weeks = new Map(staff.weeks.map((week) => [week.weekStart, week]));
    for (const day of staff.days) {
      const week = weeks.get(weekStartKey(day.day));
      lines.push(
        [
          staff.staffName,
          day.day,
          formatDuration(day.ms),
          day.dailyOt ? "כן" : "לא",
          formatDuration(day.excessMs),
          week?.weekStart ?? weekStartKey(day.day),
          formatDuration(week?.ms ?? 0),
          week?.weeklyOt ? "כן" : "לא",
          formatDuration(week?.excessMs ?? 0),
          day.open ? "כן" : "לא",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function cleanPunch(value: unknown): TimePunch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<TimePunch>;
  const kind = raw.kind;
  if (kind !== "in" && kind !== "out" && kind !== "break-start" && kind !== "break-end") return null;
  if (typeof raw.id !== "string" || typeof raw.staffId !== "string" || typeof raw.at !== "string") return null;
  const at = Date.parse(raw.at);
  if (!Number.isFinite(at)) return null;
  const edits = Array.isArray(raw.edits)
    ? raw.edits
        .filter((item) => item && typeof item === "object" && typeof item.why === "string" && typeof item.at === "string")
        .slice(0, 20)
        .map((item) => ({
          at: item.at,
          byId: typeof item.byId === "string" ? item.byId.slice(0, 40) : "",
          byName: typeof item.byName === "string" ? item.byName.slice(0, 40) : "",
          why: item.why.slice(0, 160),
          previousAt: typeof item.previousAt === "string" ? item.previousAt : raw.at || "",
        }))
    : [];
  const added = raw.added && typeof raw.added === "object" && typeof raw.added.why === "string"
    ? {
        at: typeof raw.added.at === "string" ? raw.added.at : raw.at,
        byId: typeof raw.added.byId === "string" ? raw.added.byId.slice(0, 40) : "",
        byName: typeof raw.added.byName === "string" ? raw.added.byName.slice(0, 40) : "",
        why: raw.added.why.slice(0, 160),
      }
    : undefined;
  return {
    id: raw.id.slice(0, 80),
    staffId: raw.staffId.slice(0, 40),
    staffName: typeof raw.staffName === "string" ? raw.staffName.slice(0, 40) : "",
    kind,
    at: new Date(at).toISOString(),
    originalAt: typeof raw.originalAt === "string" && Number.isFinite(Date.parse(raw.originalAt)) ? new Date(raw.originalAt).toISOString() : new Date(at).toISOString(),
    registerNo: typeof raw.registerNo === "number" && Number.isInteger(raw.registerNo) ? raw.registerNo : null,
    registerName: typeof raw.registerName === "string" ? raw.registerName.slice(0, 40) : "",
    storeId: typeof raw.storeId === "string" ? raw.storeId.slice(0, 40) : "",
    voided: raw.voided === true,
    edits,
    ...(added ? { added } : {}),
  };
}

export function cleanPunches(value: unknown): TimePunch[] {
  if (!Array.isArray(value)) return [];
  const punches: TimePunch[] = [];
  for (const item of value) {
    const punch = cleanPunch(item);
    if (punch) punches.push(punch);
    if (punches.length >= 4000) break;
  }
  return punches;
}

export function punchSyncMark(punch: TimePunch): string {
  return `${punch.at}:${punch.voided}:${punch.edits.length}:${punch.added?.at ?? ""}`;
}
