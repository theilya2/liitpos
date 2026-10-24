import assert from "node:assert/strict";
import test from "node:test";
import { applyDocs, changesToDocs } from "@/lib/pos/docs.ts";
import { cloneSettings, emptyBranch } from "@/lib/pos/seed.ts";
import {
  applyClock,
  applyPunchEdit,
  attendanceReport,
  clockByPin,
  formatDuration,
  jerusalemDayKey,
  manualPunch,
  selectPunches,
  shiftStatus,
} from "@/lib/pos/timeclock.ts";
import type { StaffUser, TimePunch } from "@/lib/pos/types.ts";

const dana: StaffUser = { id: "u1", name: "דנה", pin: "1111", role: "cashier", active: true, storeIds: ["biz"] };
const EMPTY = selectPunches(undefined);

function at(iso: string): string {
  return new Date(iso).toISOString();
}

test("Jerusalem day keys and a shift that crosses midnight", () => {
  assert.equal(jerusalemDayKey(Date.parse("2026-10-24T05:00:00.000Z")), "2026-10-24");
  assert.equal(selectPunches(null), EMPTY);
  assert.equal(selectPunches(undefined), EMPTY);
  let id = 0;
  const punches = applyClock({
    punches: [],
    staff: dana,
    kind: "in",
    at: at("2026-10-23T19:00:00.000Z"),
    registerNo: 2,
    registerName: "דלפק",
    storeId: "biz",
    id: () => `p${(id += 1)}`,
  }).punches;
  const closed = applyClock({
    punches,
    staff: dana,
    kind: "out",
    at: at("2026-10-23T23:00:00.000Z"),
    registerNo: 2,
    registerName: "דלפק",
    storeId: "biz",
    id: () => `p${(id += 1)}`,
  });
  assert.equal(closed.ok, true);
  const report = attendanceReport(closed.punches, "2026-10");
  const days = report[0].days;
  assert.deepEqual(
    days.map((day) => [day.day, formatDuration(day.ms)]),
    [
      ["2026-10-23", "2:00"],
      ["2026-10-24", "2:00"],
    ],
  );
});

test("daily overtime above 8.6h, weekly above 42h, and breaks", () => {
  let id = 0;
  const nextId = () => `p${(id += 1)}`;
  let punches: TimePunch[] = [];
  const shift = (day: string, startHour: number, endHour: number) => {
    const start = Date.parse(`${day}T${String(startHour - 3).padStart(2, "0")}:00:00.000Z`);
    const end = Date.parse(`${day}T${String(endHour - 3).padStart(2, "0")}:00:00.000Z`);
    punches = applyClock({ punches, staff: dana, kind: "in", at: new Date(start).toISOString(), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
    punches = applyClock({ punches, staff: dana, kind: "out", at: new Date(end).toISOString(), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  };
  for (const day of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) shift(day, 8, 16);
  const week = attendanceReport(punches, "2026-10")[0];
  assert.equal(week.days.some((day) => day.dailyOt), false);
  assert.equal(week.weeks.some((row) => row.weeklyOt), true);
  assert.equal(week.weeks[0].weekStart, "2026-10-18");

  punches = applyClock({ punches: [], staff: dana, kind: "in", at: at("2026-10-24T05:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  punches = applyClock({ punches, staff: dana, kind: "out", at: at("2026-10-24T14:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  const long = attendanceReport(punches, "2026-10")[0];
  assert.equal(long.days[0].dailyOt, true);
  assert.equal(formatDuration(long.days[0].ms), "9:00");

  punches = applyClock({ punches: [], staff: dana, kind: "in", at: at("2026-10-24T05:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  punches = applyClock({ punches, staff: dana, kind: "break-start", at: at("2026-10-24T09:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  assert.equal(shiftStatus(punches, dana.id), "break");
  punches = applyClock({ punches, staff: dana, kind: "break-end", at: at("2026-10-24T10:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  punches = applyClock({ punches, staff: dana, kind: "out", at: at("2026-10-24T14:00:00.000Z"), registerNo: 1, registerName: "", storeId: "biz", id: nextId }).punches;
  const rested = attendanceReport(punches, "2026-10")[0];
  assert.equal(formatDuration(rested.days[0].ms), "8:00");
  assert.equal(rested.days[0].dailyOt, false);
  assert.equal(punches.filter((punch) => punch.kind === "break-end").length, 1);
});

test("open shifts stay visible and a correction keeps the original time", () => {
  const opened = applyClock({
    punches: [],
    staff: dana,
    kind: "in",
    at: at("2026-10-24T05:00:00.000Z"),
    registerNo: 4,
    registerName: "חלון",
    storeId: "biz",
    id: () => "in-1",
  });
  const report = attendanceReport(opened.punches, "2026-10")[0];
  assert.equal(report.days[0].open, true);
  assert.equal(report.totalMs, 0);
  const edited = applyPunchEdit(opened.punches[0], {
    atIso: "2026-10-24T06:00:00.000Z",
    why: "שכחה לנקב",
    byId: "mgr",
    byName: "מנהל",
    editedAt: "2026-10-24T18:00:00.000Z",
  });
  assert.ok(edited);
  assert.equal(edited.originalAt, opened.punches[0].at);
  assert.equal(edited.at, at("2026-10-24T06:00:00.000Z"));
  assert.equal(edited.edits[0].why, "שכחה לנקב");
  assert.equal(edited.edits[0].previousAt, opened.punches[0].at);
  assert.equal(applyPunchEdit(opened.punches[0], { atIso: opened.punches[0].at, why: " ", byId: "mgr", byName: "מנהל", editedAt: opened.punches[0].at }), null);

  const added = manualPunch({
    staff: dana,
    kind: "out",
    atIso: "2026-10-24T14:00:00.000Z",
    why: "יציאה שלא נוקבה",
    byId: "mgr",
    byName: "מנהל",
    editedAt: "2026-10-24T18:00:00.000Z",
    registerNo: 4,
    registerName: "חלון",
    storeId: "biz",
    id: "out-1",
  });
  assert.equal(added?.added?.byName, "מנהל");
  const denied = clockByPin({ punches: [], staff: [dana], storeId: "biz", pin: "0000", kind: "in", at: opened.punches[0].at, registerNo: null, registerName: "", id: () => "x" });
  assert.equal(denied.ok, false);
});

test("punch corrections sync and a later edit replaces the cloud copy", () => {
  const before = emptyBranch("biz", cloneSettings());
  const punch: TimePunch = {
    id: "in-1",
    staffId: "u1",
    staffName: "דנה",
    kind: "in",
    at: "2026-10-24T05:00:00.000Z",
    originalAt: "2026-10-24T05:00:00.000Z",
    registerNo: 2,
    registerName: "דלפק",
    storeId: "biz",
    voided: false,
    edits: [],
  };
  const docs = changesToDocs(before, { ...before, punches: [punch] }, { punches: [punch] });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].kind, "punch");
  assert.equal((docs[0].doc as { registerNo: number }).registerNo, 2);
  const applied = applyDocs({ stores: [before], staff: [], activeStoreId: "biz", outbox: [], docs });
  assert.equal(applied.stores[0].punches[0].originalAt, punch.originalAt);
  const edited = applyPunchEdit(punch, { atIso: "2026-10-24T06:00:00.000Z", why: "תיקון", byId: "mgr", byName: "מנהל", editedAt: "2026-10-24T18:00:00.000Z" });
  assert.ok(edited);
  const again = changesToDocs({ ...before, punches: [punch] }, { ...before, punches: [edited] }, { punches: [edited] });
  assert.equal(again.length, 1);
  const updated = applyDocs({ stores: applied.stores, staff: [], activeStoreId: "biz", outbox: [], docs: again });
  assert.equal(updated.stores[0].punches.length, 1);
  assert.equal(updated.stores[0].punches[0].originalAt, punch.originalAt);
  assert.equal(updated.stores[0].punches[0].edits[0].byName, "מנהל");
});
