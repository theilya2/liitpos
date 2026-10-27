import { useEffect, useRef, useState } from "react";
import { pushToast } from "@/components/pos/toasts";
import { formatWhen } from "@/lib/pos/money";
import { readSessionToken } from "@/lib/pos/native";
import { usePos } from "@/lib/pos/store";
import { registerCaption, REVOKED_DETAIL } from "@/lib/pos/register";
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
  const offline = phase === "offline" || phase === "local" || phase === "error" || phase === "revoked";
  const syncing = phase === "syncing" || phase === "checking" || pending > 0;
  const dot = offline ? "bg-[#e11d63]" : syncing ? "bg-[#f59e0b]" : "bg-[#12b886]";
  const tone = offline ? "bg-copper-soft text-copper" : syncing ? "bg-[#fff4d6] text-[#92400e]" : "bg-[#e7fbe9] text-[#166534]";
  const label = phase === "revoked" ? "נותקה" : phase === "error" ? "שגיאה" : phase === "local" ? "לא מחובר" : phase === "offline" ? "לא מקוון" : phase === "checking" ? "בודקים" : pending > 0 ? `${pending} ממתינים` : phase === "syncing" ? "מסנכרן" : "מסונכרן";
  const seen = useRef(phase);
  useEffect(() => {
    if (seen.current === phase) return;
    seen.current = phase;
    if (phase === "synced") pushToast("סונכרן");
    else if (phase === "offline" || phase === "local") pushToast("אין חיבור");
    else if (phase === "error" || phase === "revoked") pushToast(detail || "שגיאה");
  }, [detail, phase]);

  return (
    <div className="no-print relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${tone}`} aria-expanded={open}>
        <span className={`sync-dot ${dot} ${phase === "syncing" ? "is-sync text-[#f59e0b]" : ""}`} aria-hidden="true" />
        {label}
      </button>
      {phase === "revoked" ? (
        <p className="absolute end-0 top-full z-30 mt-1 w-64 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-pretty text-copper shadow-lg ring-1 ring-line">{detail || REVOKED_DETAIL}</p>
      ) : null}
      {open ? (
        <div className="absolute end-0 top-full z-30 mt-1 w-64 rounded-xl bg-surface px-3 py-2 text-xs text-ink shadow-lg ring-1 ring-line">
          <p className="text-pretty">{detail || "אין פרטים נוספים."}</p>
          <p className="mt-1 text-pretty text-muted">{lastGoodSync ? `סונכרן לאחרונה ${formatWhen(lastGoodSync)}` : "עדיין לא היה סנכרון מהמכשיר הזה"}</p>
        </div>
      ) : null}
    </div>
  );
}

/** Register number for the business this device was paired to. */
export function RegisterMark() {
  const no = usePos((state) => state.registerNo);
  const name = usePos((state) => state.registerName);
  const businessId = usePos((state) => state.registerBusinessId);
  const revoked = usePos((state) => state.registerRevoked);
  const active = usePos((state) => state.activeStoreId);
  const caption = !revoked && businessId === active ? registerCaption(no, name) : "";
  if (!caption) return null;
  return <p className="no-print min-w-0 truncate text-xs font-semibold">{caption}</p>;
}
