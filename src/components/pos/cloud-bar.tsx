import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { syncNow, useCloudStatus } from "@/lib/pos/sync";
import { currentUser, usePos } from "@/lib/pos/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function CloudSync() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      useCloudStatus.setState({ phase: "local", detail: "בלי חשבון העסקאות נשארות במכשיר" });
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
  }, [isPending, userId]);

  return null;
}

export function CloudBar({ link }: { link?: boolean }) {
  const phase = useCloudStatus((state) => state.phase);
  const detail = useCloudStatus((state) => state.detail);
  const pending = usePos((state) => state.outbox.length);
  const pinUser = usePos(currentUser);
  const label =
    phase === "offline"
      ? "אין רשת"
      : phase === "syncing"
        ? "מסנכרנים"
        : phase === "error"
          ? "סנכרון נכשל"
          : phase === "synced"
            ? "בענן"
            : phase === "local"
              ? "שמירה מקומית"
              : "בודקים חיבור";
  const tone = phase === "error" || phase === "offline" ? "bg-copper-soft text-copper" : "bg-pine-soft text-pine";
  const Icon = phase === "offline" || phase === "local" ? CloudOff : phase === "syncing" ? RefreshCw : CloudUpload;

  return (
    <div className={`no-print flex shrink-0 items-center gap-2 px-3 py-2 text-xs ${tone}`}>
      <Icon className={`size-3.5 shrink-0 ${phase === "syncing" ? "animate-spin" : ""}`} />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{label}</span>
        {detail ? ` · ${detail}` : ""}
        {pending > 0 && phase !== "syncing" ? ` · ${pending} ממתינות` : ""}
      </p>
      {link && pinUser?.role === "manager" ? (
        <Link to="/admin" className="shrink-0 font-semibold">
          לוח בקרה
        </Link>
      ) : null}
    </div>
  );
}
