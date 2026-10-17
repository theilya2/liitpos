import { useMemo, useState } from "react";
import { usePos } from "@/lib/pos/store";
import type { ClubMember } from "@/lib/pos/types";

const empty: ClubMember = { id: "", firstName: "", lastName: "", phone: "", note: "", active: true };

export function ClubPanel() {
  const members = usePos((state) => state.members);
  const saveMember = usePos((state) => state.saveMember);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ClubMember | null>(null);
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    const q = query.trim();
    const digits = q.replace(/\D/g, "");
    return (members ?? []).filter((member) => {
      if (!q) return true;
      if (member.firstName.includes(q) || member.lastName.includes(q)) return true;
      if (digits && member.phone.replace(/\D/g, "").includes(digits)) return true;
      return member.phone.includes(q);
    });
  }, [members, query]);

  function save() {
    if (!draft) return;
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError("צריך שם פרטי ושם משפחה.");
      return;
    }
    if (draft.phone.replace(/\D/g, "").length < 9) {
      setError("צריך טלפון מלא.");
      return;
    }
    saveMember({ ...draft, id: draft.id || `m_${crypto.randomUUID()}` });
    setDraft(null);
    setError("");
  }

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">חברי מועדון</h2>
        <button type="button" onClick={() => { setError(""); setDraft({ ...empty }); }} className="h-11 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
          חבר חדש
        </button>
      </div>
      <p className="text-sm text-muted">חיפוש לפי טלפון, שם פרטי או שם משפחה. הכרטיס עצמו מחויב במסוף שבחרתם בקופה.</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="טלפון, שם פרטי או משפחה"
        aria-label="חיפוש חבר מועדון"
        className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
      />
      {visible.length === 0 ? <p className="text-sm text-muted">אין חברים תואמים.</p> : null}
      <ul className="space-y-2">
        {visible.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => { setError(""); setDraft(member); }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-paper px-3 py-3 text-start ring-1 ring-line"
            >
              <span>
                <span className={`block font-medium ${member.active ? "" : "text-muted line-through"}`}>
                  {member.firstName} {member.lastName}
                </span>
                <span className="text-sm text-muted" dir="ltr">{member.phone}</span>
              </span>
              <span className="text-sm text-pine">עריכה</span>
            </button>
          </li>
        ))}
      </ul>
      {draft ? (
        <form
          className="space-y-2 rounded-2xl bg-paper p-3 ring-1 ring-line"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="block text-sm text-muted">
            שם פרטי
            <input value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line" />
          </label>
          <label className="block text-sm text-muted">
            שם משפחה
            <input value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line" />
          </label>
          <label className="block text-sm text-muted">
            טלפון
            <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} dir="ltr" inputMode="tel" className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line" />
          </label>
          <label className="block text-sm text-muted">
            הערה
            <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line" />
          </label>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, active: !draft.active })}
            className={`h-11 w-full rounded-xl text-sm ${draft.active ? "bg-pine-soft text-pine" : "bg-surface text-muted ring-1 ring-line"}`}
          >
            {draft.active ? "פעיל" : "לא פעיל"}
          </button>
          {error ? <p className="text-sm text-copper">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-xl bg-surface ring-1 ring-line">
              ביטול
            </button>
            <button type="submit" className="h-11 rounded-xl bg-pine font-semibold text-pine-ink">
              שמירה
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
