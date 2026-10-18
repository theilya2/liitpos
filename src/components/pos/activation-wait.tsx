import { useEffect, useState } from "react";
import { pollActivation, requestActivationCode } from "@/lib/pos/activation-client";
import { readActivationIdentity, readSessionToken, rememberActivationChoice, writeSessionToken, type ActivationIdentity } from "@/lib/pos/native";
import { REVOKED_DETAIL } from "@/lib/pos/register";

const POLL_MS = 4000;

export function ActivationWait({ disconnected }: { disconnected: boolean }) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const onOnline = () => void tick();
    let identity: ActivationIdentity | null = null;
    async function tick() {
      if (stop || !identity) return;
      const latest = await readActivationIdentity();
      if (stop) return;
      identity = { ...identity, sources: latest.sources.length ? latest.sources : identity.sources };
      const polled = await pollActivation(identity.deviceId);
      if (stop) return;
      if (polled.status === "approved" && polled.token) {
        writeSessionToken(polled.token);
        await pollActivation(identity.deviceId, true);
        return;
      }
      if (polled.status === "approved" && readSessionToken()) return;
      if (polled.status === "offline" || polled.status === "error") {
        setOffline(polled.status === "offline");
        if (polled.status === "error") setNotice(polled.detail);
        return;
      }
      if (polled.status === "rejected") setNotice("המנהל דחה את הבקשה. אותו קוד הפעלה נשאר, ומחכים לאישור מחדש.");
      const requested = await requestActivationCode(identity);
      if (stop) return;
      if ("code" in requested) {
        identity = { ...identity, deviceId: requested.deviceId, code: requested.code, source: requested.source };
        rememberActivationChoice(requested);
        setCode(requested.code);
        setOffline(false);
        if (polled.status !== "rejected") setNotice("");
        return;
      }
      if (polled.status === "pending") {
        setOffline(false);
        if (polled.code) setCode(polled.code);
        return;
      }
      setOffline(requested.offline);
      setNotice(requested.error);
    }
    void readActivationIdentity().then((next) => {
      if (stop) return;
      identity = next;
      setCode(next.code);
      void tick();
      timer = window.setInterval(() => void tick(), POLL_MS);
      window.addEventListener("online", onOnline);
    });
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
          <p className="mt-2 text-sm text-pretty text-muted">הקוד קבוע למכשיר הזה ונשאר גם אחרי התקנה מחדש. בלוח הבקרה מאשרים אותו תחת «קופות ממתינות לאישור».</p>
          {offline ? <p className="mt-2 text-sm text-pretty text-copper">אין רשת כרגע. הבדיקה תימשך כשהחיבור יחזור.</p> : null}
          {notice ? <p className="mt-2 text-sm text-pretty text-copper">{notice}</p> : null}
        </>
      ) : (
        <p className="mt-4 text-lg font-semibold text-pretty">{notice || "מפיקים קוד הפעלה…"}</p>
      )}
    </>
  );
}
