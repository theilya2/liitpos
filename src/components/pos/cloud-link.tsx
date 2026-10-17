import { useEffect, useState } from "react";
import { isNativeApp, readCloudUrl, readSessionToken, startCloudLink, writeCloudUrl } from "@/lib/pos/native";
import { syncNow } from "@/lib/pos/sync";

export function CloudLinkCard() {
  const [native, setNative] = useState(false);
  const [url, setUrl] = useState("");
  const [linked, setLinked] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setNative(isNativeApp());
    setUrl(readCloudUrl());
    setLinked(Boolean(readSessionToken()));
    const refresh = () => setLinked(Boolean(readSessionToken()));
    window.addEventListener("liitpos-session", refresh);
    return () => window.removeEventListener("liitpos-session", refresh);
  }, []);

  if (!native) return null;

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">ענן</h2>
      <p className="text-sm text-muted">
        הקופה עובדת בלי רשת. כשיש כתובת וחשבון, המכירות ממתינות ואז עולות לבד. הכתובת היא האתר שכבר רץ באוויר, למשל הכתובת של Vercel.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">כתובת השרת</span>
        <input
          dir="ltr"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.vercel.app"
          className="h-12 w-full rounded-xl bg-paper px-3 text-left ring-1 ring-line"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="h-11 rounded-xl bg-pine px-4 text-sm font-semibold text-pine-ink"
          onClick={() => {
            const saved = writeCloudUrl(url);
            setUrl(saved);
            setNote(saved ? "הכתובת נשמרה במכשיר." : "צריך כתובת שמתחילה ב-https.");
          }}
        >
          שמירת כתובת
        </button>
        <button
          type="button"
          className="h-11 rounded-xl bg-paper px-4 text-sm font-semibold ring-1 ring-line"
          onClick={() => {
            if (!readCloudUrl()) {
              setNote("קודם שומרים את כתובת השרת.");
              return;
            }
            startCloudLink();
          }}
        >
          {linked ? "חיבור מחדש" : "חיבור חשבון"}
        </button>
        <button
          type="button"
          className="h-11 rounded-xl bg-paper px-4 text-sm font-semibold ring-1 ring-line"
          onClick={() => void syncNow()}
        >
          סנכרון עכשיו
        </button>
      </div>
      <p className="text-xs text-muted">{linked ? "החשבון מחובר במכשיר הזה." : "עדיין בלי חשבון. המכירות נשארות במכשיר."}</p>
      {note ? <p className="text-sm">{note}</p> : null}
    </section>
  );
}
