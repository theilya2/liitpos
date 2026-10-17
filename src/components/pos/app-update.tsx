import { useEffect, useState } from "react";
import { checkForUpdate, installUpdate, isNativeApp, type AppUpdate } from "@/lib/pos/native";

export function AppUpdateBanner() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let stop = false;
    const look = () => {
      void checkForUpdate()
        .then((next) => {
          if (!stop) setUpdate(next);
        })
        .catch(() => undefined);
    };
    look();
    const timer = window.setInterval(look, 6 * 60 * 60 * 1000);
    window.addEventListener("online", look);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener("online", look);
    };
  }, []);

  if (!update) return null;

  return (
    <div className="no-print flex items-center gap-2 bg-pine px-3 py-2 text-sm text-pine-ink">
      <p className="min-w-0 flex-1">יש עדכון {update.versionName}. אחרי ההתקנה הקופה והנתונים נשארים.</p>
      <button type="button" className="h-10 shrink-0 rounded-xl bg-paper px-3 font-semibold text-ink" onClick={() => installUpdate(update)}>
        התקנה
      </button>
    </div>
  );
}
