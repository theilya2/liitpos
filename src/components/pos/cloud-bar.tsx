import { useEffect, useState } from "react";
import { formatWhen } from "@/lib/pos/money";
import { readSessionToken } from "@/lib/pos/native";
import { usePos } from "@/lib/pos/store";
import { syncNow, UNPAIRED_DETAIL, useCloudStatus } from "@/lib/pos/sync";

/** Keeps a paired device in sync. Renders nothing, and does not link to the back office. */
export function CloudSync() {
  const [token, setToken] = useState("");

  useEffect(() => {
    const refresh = () => setToken(readSessionToken());
    refresh();
    window.addEventListener("liitpos-session", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("liitpos-session", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      useCloudStatus.setState({ phase: "local", detail: UNPAIRED_DETAIL });
      return;
    }
    let stop = false;
    const tick = () => {
      if (!stop) void syncNow();
    };
    tick();
    const timer = window.setInterval(tick, 20000);
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }, [token]);

  return null;
}

/** Small status chip. Tap it for the last sync time. It never links to the back office. */
export function SyncIndicator() {
  const phase = useCloudStatus((state) => state.phase);
  const detail = useCloudStatus((state) => state.detail);
  const pending = usePos((state) => state.outbox.length);
  const lastGoodSync = usePos((state) => state.lastGoodSync);
  const [open, setOpen] = useState(false);
  const grey = phase === "offline" || phase === "local" || phase === "checking";
  const tone = grey ? "bg-line text-muted" : pending > 0 || phase === "syncing" || phase === "error" ? "bg-copper-soft text-copper" : "bg-pine-soft text-pine";
  const label = phase === "error" ? "שגיאה" : grey ? (phase === "local" ? "לא מחובר" : phase === "offline" ? "לא מקוון" : "בודקים") : pending > 0 ? `${pending} ממתינים` : phase === "syncing" ? "מסנכרן" : "מסונכרן";

  return (
    <div className="no-print shrink-0 px-2 pt-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className={`inline-flex h-12 items-center gap-2 rounded-full px-3 text-sm font-semibold ${tone}`} aria-expanded={open}>
        <span className={`h-2.5 w-2.5 rounded-full ${grey ? "bg-muted" : pending > 0 || phase === "syncing" || phase === "error" ? "bg-copper" : "bg-pine"}`} aria-hidden="true" />
        {label}
      </button>
      {open ? (
        <div className="mb-2 mt-2 max-w-md rounded-2xl bg-surface px-3 py-2 text-sm text-ink ring-1 ring-line">
          <p className="text-pretty">{detail || "אין פרטים נוספים."}</p>
          <p className="mt-1 text-pretty text-muted">{lastGoodSync ? `סונכרן לאחרונה ${formatWhen(lastGoodSync)}` : "עדיין לא היה סנכרון מהמכשיר הזה"}</p>
        </div>
      ) : null}
    </div>
  );
}
