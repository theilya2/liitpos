import { useEffect, useState } from "react";
import { AttendanceReport } from "@/components/pos/attendance-report";
import { saveAttendance, saveCustomerScreen } from "@/lib/pos/cloud.functions";
import { selectCustomerSlides } from "@/lib/pos/customer-screen";
import { compressImage } from "@/lib/pos/image";
import type { KioskSlide, PunchKind, Settings, TimePunch } from "@/lib/pos/types";

export function BackOfficeExtras({
  businessId,
  settings,
  staff,
  onSaved,
}: {
  businessId: string;
  settings: Settings;
  staff: { id: string; name: string }[];
  onSaved: () => Promise<void> | void;
}) {
  const [punches, setPunches] = useState<TimePunch[]>([]);
  const [note, setNote] = useState("");
  const [slides, setSlides] = useState<KioskSlide[]>(() => selectCustomerSlides(settings.customerSlides));
  const [enabled, setEnabled] = useState(settings.customerScreen !== false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlides(selectCustomerSlides(settings.customerSlides));
    setEnabled(settings.customerScreen !== false);
  }, [settings]);

  useEffect(() => {
    let live = true;
    void saveAttendance({ data: { businessId, action: "load", punchId: "", staffId: "", staffName: "", kind: "in", at: "", why: "" } })
      .then((result) => {
        if (live) setPunches(result.punches);
      })
      .catch(() => {
        if (live) setNote("דוח הנוכחות ייטען כשהעסק מחובר.");
      });
    return () => {
      live = false;
    };
  }, [businessId]);

  async function edit(action: "correct" | "void" | "add", extra: { punchId?: string; staffId?: string; staffName?: string; kind?: PunchKind; at?: string; why?: string }) {
    const result = await saveAttendance({
      data: {
        businessId,
        action,
        punchId: extra.punchId ?? "",
        staffId: extra.staffId ?? "",
        staffName: extra.staffName ?? staff.find((person) => person.id === extra.staffId)?.name ?? "",
        kind: extra.kind ?? "in",
        at: extra.at ?? "",
        why: extra.why ?? "",
      },
    });
    setPunches(result.punches);
    return { ok: result.ok, message: result.message };
  }

  return (
    <div className="mt-4 space-y-4">
      <AttendanceReport
        punches={punches}
        staff={staff}
        canEdit
        onCorrect={(id, atIso, why) => edit("correct", { punchId: id, at: atIso, why })}
        onAdd={(staffId, kind, atIso, why) => edit("add", { staffId, kind, at: atIso, why })}
        onVoid={(id, why) => edit("void", { punchId: id, why })}
      />
      <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <h2 className="text-base font-semibold">מסך לקוח</h2>
        <p className="mt-1 text-sm text-muted">כשהקופה פנויה, המסך השני מציג את הלוגו ואת התמונות כאן. בזמן מכירה הוא עובר לסל.</p>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((current) => !current)}
          className={`mt-3 min-h-12 w-full rounded-xl px-3 text-sm font-medium ${enabled ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
        >
          {enabled ? "המסך פעיל בקופות" : "המסך כבוי בקופות"}
        </button>
        <ul className="mt-3 space-y-2">
          {slides.map((slide, index) => (
            <li key={slide.id} className="flex items-center gap-2 rounded-xl bg-paper p-2 ring-1 ring-line">
              <img src={slide.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <input
                value={slide.caption}
                onChange={(event) => setSlides((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, caption: event.target.value.slice(0, 80) } : item)))}
                placeholder="כיתוב"
                className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-3 ring-1 ring-line"
              />
              <button type="button" onClick={() => setSlides((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-12 rounded-xl px-3 text-sm text-copper">
                הסרה
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
          הוספת תמונה
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void compressImage(file, 960)
                .then((image) => setSlides((current) => (current.length >= 8 ? current : [...current, { id: `slide-${Date.now()}`, image, caption: "" }])))
                .catch(() => setNote("התמונה גדולה מדי."));
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNote("");
            void saveCustomerScreen({ data: { businessId, enabled, slides } })
              .then(async () => {
                setNote("מצגת המסך נשמרה. הקופות יקבלו אותה בסנכרון הבא.");
                await onSaved();
              })
              .catch(() => setNote("השמירה לא הצליחה."))
              .finally(() => setBusy(false));
          }}
          className="mt-3 min-h-12 w-full rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-50"
        >
          {busy ? "שומרים…" : "שמירת המסך"}
        </button>
        {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
      </section>
    </div>
  );
}
