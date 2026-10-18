import { useEffect, useState } from "react";
import { approveActivation, listPendingActivations, rejectActivation } from "@/lib/pos/activation.functions";
import { normalizeActivationCode } from "@/lib/pos/activation";
import { formatRegisterTime } from "@/lib/pos/register";
import type { PanelBusiness } from "@/lib/pos/cloud.functions";

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    if (message && message !== "Unauthorized" && !message.startsWith("[")) return message;
  }
  return "הפעולה לא נשמרה.";
}

export function PendingActivations({ businesses }: { businesses: PanelBusiness[] }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPendingActivations>>>([]);
  const [code, setCode] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await listPendingActivations();
    setRows(next);
  }

  useEffect(() => {
    let live = true;
    const load = () => {
      void listPendingActivations()
        .then((next) => {
          if (live) setRows(next);
        })
        .catch((reason: unknown) => {
          if (live) setError(messageOf(reason));
        });
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!businessId && businesses[0]) setBusinessId(businesses[0].id);
  }, [businessId, businesses]);

  async function run(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      if (!normalizeActivationCode(code)) throw new Error("הקוד לא תקין.");
      if (action === "approve") {
        if (!businessId) throw new Error("צריך לבחור עסק.");
        await approveActivation({ data: { code, businessId, name } });
        setName("");
      } else {
        await rejectActivation({ data: { code } });
      }
      setCode("");
      await refresh();
      window.dispatchEvent(new Event("liitpos-registers"));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">קופות ממתינות לאישור</h2>
      <p className="mt-1 text-sm text-pretty text-muted">הקוד מופיע על מסך הקופה. בוחרים עסק ומאשרים, והקופה מקבלת רישיון.</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">אין קופות שממתינות.</p> : null}
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => {
                setCode(row.code);
                setError("");
              }}
              className="w-full rounded-2xl bg-paper px-3 py-3 text-start ring-1 ring-line"
            >
              <span className="block text-2xl font-semibold tracking-widest" dir="ltr">
                {row.code}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {row.model || "דגם לא ידוע"}
                {row.appVersion ? ` · גרסה ${row.appVersion}` : ""}
                {row.requestedAt ? ` · ${formatRegisterTime(row.requestedAt)}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="קוד מהקופה, למשל 4K7-29P"
          aria-label="קוד הפעלה"
          dir="ltr"
          className="h-12 rounded-xl bg-paper px-3 tracking-widest ring-1 ring-line"
        />
        <select
          value={businessId}
          onChange={(event) => setBusinessId(event.target.value)}
          aria-label="עסק"
          className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line"
        >
          <option value="">בחירת עסק</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.settings.businessName}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="שם קופה, לא חובה"
          aria-label="שם קופה לאישור"
          className="h-12 rounded-xl bg-paper px-3 ring-1 ring-line"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => void run("reject")} className="h-12 rounded-xl bg-paper text-sm ring-1 ring-line disabled:opacity-50">
            דחייה
          </button>
          <button type="button" disabled={busy || !businesses.length} onClick={() => void run("approve")} className="h-12 rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-50">
            אישור
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-pretty text-copper">{error}</p> : null}
    </section>
  );
}
