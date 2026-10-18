import { useEffect, useState } from "react";
import { formatWhen } from "@/lib/pos/money";
import { formatRegisterTime } from "@/lib/pos/register";
import {
  listLegacyTokens,
  listRegisters,
  renameRegister,
  revokeLegacyToken,
  revokeRegister,
  type RegisterView,
} from "@/lib/pos/device-tokens.functions";
import type { DeviceTokenView } from "@/lib/auth/pairing";

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    if (message && message !== "Unauthorized" && !message.startsWith("[")) return message;
  }
  return "הפעולה לא נשמרה.";
}

function statusOf(row: RegisterView): string {
  if (row.revoked) return "נותקה";
  if (!row.paired) return "ממתינה לשיוך";
  return row.online ? "מחוברת" : "לא מקוונת";
}

export function RegistersAdmin({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<RegisterView[]>([]);
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const all = await listRegisters();
    setRows(all.filter((row) => row.businessId === businessId));
  }

  useEffect(() => {
    let live = true;
    const load = () => {
      void listRegisters()
        .then((all) => {
          if (live) setRows(all.filter((row) => row.businessId === businessId));
        })
        .catch((reason: unknown) => {
          if (live) setError(messageOf(reason));
        });
    };
    load();
    window.addEventListener("liitpos-registers", load);
    return () => {
      live = false;
      window.removeEventListener("liitpos-registers", load);
    };
  }, [businessId]);

  function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    void task()
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="mt-4 space-y-3">
      <h3 className="font-medium">קופות</h3>
      {rows.length === 0 ? <p className="text-sm text-pretty text-muted">עדיין אין קופה לעסק הזה. קופה חדשה מופיעה כאן אחרי אישור קוד ההפעלה.</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-paper px-3 py-3 text-sm ring-1 ring-line">
            <p className="font-medium">
              קופה {row.number}
              {row.name ? ` · ${row.name}` : ""}
            </p>
            <p className="mt-1 text-muted">
              {statusOf(row)}
              {row.appVersion ? ` · גרסה ${row.appVersion}` : " · אין גרסה"}
            </p>
            <p className="text-muted">{row.lastContact ? `חיבור אחרון ${formatRegisterTime(row.lastContact)}` : "עדיין לא התחברה"}</p>
            <p className="text-muted">{row.lastSync ? `סנכרון אחרון ${formatRegisterTime(row.lastSync)}` : "עדיין לא סונכרנה"}</p>
            <p className="text-muted">{row.pendingOutbox > 0 ? `${row.pendingOutbox} ממתינים להעלאה` : "אין המתנה"}</p>
            {renameId === row.id ? (
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await renameRegister({ data: { id: row.id, name: renameValue } });
                    setRenameId("");
                    await refresh();
                  });
                }}
              >
                <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={40} placeholder="שם, לא חובה" className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-3 ring-1 ring-line" />
                <button type="submit" disabled={busy} className="h-12 rounded-xl bg-pine px-3 font-semibold text-pine-ink disabled:opacity-50">
                  שמירה
                </button>
              </form>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line"
                  onClick={() => {
                    setRenameId(row.id);
                    setRenameValue(row.name);
                  }}
                >
                  שינוי שם
                </button>
                <button
                  type="button"
                  disabled={busy || row.revoked}
                  className="h-12 rounded-xl bg-surface px-3 ring-1 ring-line disabled:opacity-40"
                  onClick={() =>
                    run(async () => {
                      await revokeRegister({ data: { id: row.id } });
                      await refresh();
                    })
                  }
                >
                  ניתוק
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-copper">{error}</p> : null}
    </div>
  );
}

export function LegacyTokens() {
  const [rows, setRows] = useState<DeviceTokenView[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void listLegacyTokens()
      .then((data) => {
        if (live) setRows(data.filter((row) => !row.revoked));
      })
      .catch((reason: unknown) => {
        if (live) setError(messageOf(reason));
      });
    return () => {
      live = false;
    };
  }, []);

  if (!rows.length && !error) return null;
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">שיוכים ישנים</h2>
      <p className="mt-1 text-sm text-muted">מכשירים שחוברו לפני שהקופות קיבלו מספר. אפשר רק לנתק אותם.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
            <span>
              <span className="font-medium">{row.label}</span>
              <span className="text-muted">{row.lastSeen ? ` · נראה ${formatWhen(row.lastSeen)}` : " · עדיין לא התחבר"}</span>
            </span>
            <button
              type="button"
              className="h-12 shrink-0 rounded-xl bg-surface px-3 ring-1 ring-line"
              onClick={() => {
                void revokeLegacyToken({ data: { id: row.id } })
                  .then(() => setRows((current) => current.filter((item) => item.id !== row.id)))
                  .catch((reason: unknown) => setError(messageOf(reason)));
              }}
            >
              ניתוק
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-copper">{error}</p> : null}
    </section>
  );
}
