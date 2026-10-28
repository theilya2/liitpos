import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { checkForUpdate, installUpdate, isNativeApp, readNativeUpdateEvent, type AppUpdate } from "@/lib/pos/native";
import { readUpdateEvent, UPDATE_EVENT, type UpdateNotice } from "@/lib/pos/update-event";

const DISMISS_KEY = "liitpos-update-dismissed";

function readDismissed(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const code = Number(raw);
    return Number.isFinite(code) ? code : null;
  } catch {
    return null;
  }
}

function rememberDismissed(versionCode: number) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(versionCode));
  } catch {
    // A private webview can refuse storage; the bar still stays hidden this session.
  }
}

export function AppUpdateBanner() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [dismissReady, setDismissReady] = useState(false);
  const [notice, setNotice] = useState<UpdateNotice | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const visible = Boolean(dismissReady && update && update.versionCode !== dismissed);
  const busy = notice?.phase === "progress" || notice?.phase === "installing" || notice?.phase === "permission";

  useEffect(() => {
    setDismissed(readDismissed());
    setDismissReady(true);
    setNotice(readNativeUpdateEvent());
  }, []);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const next = readUpdateEvent((event as CustomEvent).detail);
      if (next) setNotice(next);
    };
    window.addEventListener(UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(UPDATE_EVENT, onUpdate);
  }, []);

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

  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = barRef.current;
    if (!visible || !node) {
      root.style.setProperty("--update-bar-offset", "0px");
      delete root.dataset.updateBar;
      return;
    }
    const apply = () => {
      root.style.setProperty("--update-bar-offset", `${node.offsetHeight}px`);
      root.dataset.updateBar = "1";
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.setProperty("--update-bar-offset", "0px");
      delete root.dataset.updateBar;
    };
  }, [visible]);

  if (!update || !visible) return null;

  const headline =
    notice && notice.phase !== "error" && notice.message
      ? notice.message
      : `יש עדכון ${update.versionName}. אחרי ההתקנה הקופה והנתונים נשארים.`;

  return (
    <div ref={barRef} className="update-bar no-print" role="region" aria-label="עדכון זמין">
      <p className="text-sm leading-snug">{headline}</p>
      {notice?.phase === "progress" || notice?.phase === "installing" ? (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={notice.percent ?? undefined}
          aria-label={notice.message || "התקדמות ההורדה"}
        >
          <span className={notice.percent == null ? "is-wait" : undefined} style={notice.percent == null ? undefined : { transform: `scaleX(${notice.percent / 100})` }} />
        </div>
      ) : null}
      {notice?.phase === "error" ? (
        <p className="text-sm font-semibold" role="alert">
          {notice.message}
        </p>
      ) : null}
      <div className="update-bar-actions">
        <button
          type="button"
          className="update-install"
          disabled={busy}
          onClick={() => {
            setNotice({ phase: "progress", percent: null, message: "מורידים…" });
            installUpdate(update);
          }}
        >
          {notice?.phase === "error" ? "נסו שוב" : busy ? "ממתינים" : "התקנה"}
        </button>
        <button
          type="button"
          className="update-dismiss"
          onClick={() => {
            rememberDismissed(update.versionCode);
            setDismissed(update.versionCode);
          }}
        >
          אחר כך
        </button>
      </div>
    </div>
  );
}
