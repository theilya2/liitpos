import { useEffect, useState } from "react";
import { createDeviceToken, listDeviceTokens, revokeDeviceToken, type DeviceTokenView } from "@/lib/pos/device-tokens.functions";
import { formatWhen } from "@/lib/pos/money";

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    if (message && message !== "Unauthorized" && !message.startsWith("[")) return message;
  }
  return "הפעולה לא נשמרה.";
}

export function DevicePairing() {
  const [rows, setRows] = useState<DeviceTokenView[]>([]);
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setRows(await listDeviceTokens());
  }

  useEffect(() => {
    let live = true;
    void listDeviceTokens()
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((reason: unknown) => {
        if (live) setError(messageOf(reason));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!link) {
      setQr("");
      return;
    }
    let live = true;
    void import("qrcode")
      .then((mod) => mod.toDataURL(link, { margin: 1, width: 240 }))
      .then((url) => {
        if (live) setQr(url);
      })
      .catch(() => {
        if (live) setQr("");
      });
    return () => {
      live = false;
    };
  }, [link]);

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">חיבור טלפון</h2>
      <p className="mt-1 text-sm text-muted">
        יוצרים קישור למכשיר. פותחים אותו בטלפון שבו מותקנת Liitpos, או סורקים את הקוד. הקישור מוצג פעם אחת. ביטול מנתק את המכשיר מהענן, והקופה עליו ממשיכה לעבוד בלי רשת.
      </p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setCopied(false);
          void createDeviceToken({ data: { label } })
            .then(async (created) => {
              setLink(created.link);
              setLabel("");
              await refresh();
            })
            .catch((reason: unknown) => setError(messageOf(reason)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-muted">שם המכשיר</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            placeholder="קופה בדלפק"
            className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
          />
        </label>
        <button type="submit" disabled={busy} className="mt-6 h-12 rounded-xl bg-pine px-4 text-sm font-semibold text-pine-ink disabled:opacity-50">
          יצירת קישור
        </button>
      </form>
      {link ? (
        <div className="mt-3 space-y-3 rounded-xl bg-paper p-3 ring-1 ring-line">
          <p className="text-sm font-medium">הקישור הזה לא יוצג שוב.</p>
          {qr ? <img src={qr} alt="" className="h-48 w-48 rounded-xl bg-white p-2" /> : null}
          <p className="break-all text-sm" dir="ltr">
            {link}
          </p>
          <button
            type="button"
            className="h-11 rounded-xl bg-surface px-4 text-sm font-semibold ring-1 ring-line"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false));
            }}
          >
            {copied ? "הועתק" : "העתקה"}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
              <span>
                <span className="font-medium">{row.label}</span>
                <span className="text-muted"> · נוצר {formatWhen(row.createdAt)}</span>
                <span className="text-muted">{row.lastSeen ? ` · נראה ${formatWhen(row.lastSeen)}` : " · עדיין לא התחבר"}</span>
                {row.revoked ? <span className="text-copper"> · מבוטל</span> : null}
              </span>
              {row.revoked ? null : (
                <button
                  type="button"
                  disabled={busy}
                  className="h-10 shrink-0 rounded-xl px-3 text-copper ring-1 ring-line disabled:opacity-50"
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void revokeDeviceToken({ data: { id: row.id } })
                      .then(() => refresh())
                      .catch((reason: unknown) => setError(messageOf(reason)))
                      .finally(() => setBusy(false));
                  }}
                >
                  ביטול
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">עדיין אין מכשיר מחובר.</p>
      )}
    </section>
  );
}
