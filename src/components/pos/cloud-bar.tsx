import { useEffect, useState } from "react";
import { readSessionToken } from "@/lib/pos/native";
import { syncNow, useCloudStatus } from "@/lib/pos/sync";

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
      useCloudStatus.setState({ phase: "local", detail: "בלי חיבור לענן העסקאות נשארות במכשיר" });
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
