import { useEffect, useRef, useState } from "react";
import { pollActivation, requestActivationCode } from "@/lib/pos/activation-client";
import { readDeviceId, readSessionToken, writeSessionToken } from "@/lib/pos/native";
import { REVOKED_DETAIL } from "@/lib/pos/register";

const POLL_MS = 4000;

export function ActivationWait({ disconnected }: { disconnected: boolean }) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const codeRef = useRef("");

  useEffect(() => {
    let stop = false;
    const deviceId = readDeviceId();
    const show = (next: string) => {
      codeRef.current = next;
      setCode(next);
    };
    const tick = async () => {
      if (stop) return;
      const polled = await pollActivation(deviceId);
      if (stop) return;
      if (polled.status === "approved" && polled.token) {
        writeSessionToken(polled.token);
        await pollActivation(deviceId, true);
        return;
      }
      if (polled.status === "approved" && readSessionToken()) return;
      if (polled.status === "pending") {
        show(polled.code);
        setOffline(false);
        setNotice("");
        return;
      }
      if ((polled.status === "offline" || polled.status === "error") && codeRef.current) {
        setOffline(polled.status === "offline");
        return;
      }
      if (polled.status === "error") {
        setNotice(polled.detail);
        return;
      }
      if (polled.status === "rejected" || polled.status === "expired") show("");
      if (polled.status === "rejected") setNotice("המנהל דחה את הבקשה. מפיקים קוד חדש.");
      const requested = await requestActivationCode(deviceId);
      if (stop) return;
      if ("code" in requested) {
        show(requested.code);
        setOffline(false);
        if (polled.status !== "rejected") setNotice("");
        return;
      }
      setOffline(requested.offline);
      if (!codeRef.current) setNotice(requested.error);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onOnline = () => void tick();
    window.addEventListener("online", onOnline);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return (
    <>
      {disconnected ? <p className="mt-4 text-sm font-semibold text-pretty text-copper">{REVOKED_DETAIL}</p> : null}
      {code ? (
        <>
          <p className="mt-4 text-lg font-semibold text-pretty">
            קוד הפעלה:{" "}
            <span className="mt-1 block text-5xl font-semibold tracking-widest text-ink" dir="ltr">
              {code}
            </span>
          </p>
          <p className="mt-3 text-lg font-semibold text-pretty">ממתין לאישור המנהל</p>
          <p className="mt-2 text-sm text-pretty text-muted">בלוח הבקרה, ב«קופות ממתינות לאישור», מאשרים את הקוד ובוחרים את העסק.</p>
          {offline ? <p className="mt-2 text-sm text-pretty text-copper">אין רשת כרגע. הבדיקה תימשך כשהחיבור יחזור.</p> : null}
          {notice ? <p className="mt-2 text-sm text-pretty text-copper">{notice}</p> : null}
        </>
      ) : (
        <p className="mt-4 text-lg font-semibold text-pretty">{notice || "מפיקים קוד הפעלה…"}</p>
      )}
    </>
  );
}
