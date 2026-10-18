import { useEffect, useState } from "react";
import { isDemoMode } from "@/lib/pos/demo";
import { PageHeader } from "@/components/pos/shell";
import { ClubPanel } from "@/components/pos/club-panel";
import { PrinterSettings } from "@/components/pos/printer-settings";
import { kioskTiming } from "@/lib/pos/kiosk";
import { compressImage } from "@/lib/pos/image";
import { usePos } from "@/lib/pos/store";
import { deviceLabel, isSafeIpv4, pingTerminal } from "@/lib/pos/terminal";
import type { TerminalEndpoint, TerminalKind } from "@/lib/pos/types";

export function SettingsPage() {
  const settings = usePos((state) => state.settings);
  const updateSettings = usePos((state) => state.updateSettings);
  const clearHistory = usePos((state) => state.clearHistory);
  const resetDemo = usePos((state) => state.resetDemo);
  const [armed, setArmed] = useState<"none" | "history" | "demo">("none");

  return (
    <div className="scroll-pane page-sheet min-h-0 flex-1">
      <PageHeader title="הגדרות" subtitle="פרטי העסק מופיעים על כל קבלה חדשה." />
      <div className="space-y-3 px-3 pb-8">
        <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">פרטי העסק</h2>
          <p className="text-sm text-muted">
            מזהה כניסה <span className="font-semibold tabular-nums text-ink" dir="ltr">{settings.code}</span>. אותו מקלידים לפני רשימת המשתמשים.
          </p>
          <Field label="שם העסק" value={settings.businessName} onChange={(value) => updateSettings({ businessName: value })} />
          <div className="flex items-center gap-3">
            {settings.logo ? (
              <img src={settings.logo} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pine text-lg font-bold text-pine-ink">₪</span>
            )}
            <div>
              <p className="text-sm font-medium">לוגו</p>
              <p className="text-xs text-muted">מופיע בכניסה, בבחירת משתמש ובמדף הימני העליון.</p>
              <div className="mt-2 flex gap-2">
                <label className="flex h-12 cursor-pointer items-center rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
                  העלאה
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void compressImage(file, 320).then((logo) => updateSettings({ logo }));
                    }}
                  />
                </label>
                {settings.logo ? (
                  <button type="button" onClick={() => updateSettings({ logo: null })} className="h-12 rounded-xl px-3 text-sm text-copper">
                    הסרה
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <Field label="שם בעל העסק" value={settings.ownerName} onChange={(value) => updateSettings({ ownerName: value })} />
          <Field label="עוסק מורשה / ח.פ." value={settings.taxId} onChange={(value) => updateSettings({ taxId: value })} ltr />
          <Field label="כתובת" value={settings.address} onChange={(value) => updateSettings({ address: value })} />
          <Field label="טלפון" value={settings.phone} onChange={(value) => updateSettings({ phone: value })} ltr />
          <label className="block">
            <span className="mb-1 block text-sm text-muted">שורת תחתית בקבלה</span>
            <textarea
              value={settings.receiptFooter}
              onChange={(event) => updateSettings({ receiptFooter: event.target.value.slice(0, 160) })}
              rows={3}
              className="w-full rounded-xl bg-paper px-3 py-2 ring-1 ring-line"
            />
          </label>
        </section>
        <PrinterSettings />
        <KioskTiming />
        <ClubPanel />
        <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">מספרים</h2>
          <Field
            label="שיעור מע״מ באחוזים"
            value={String(settings.vatRate)}
            ltr
            onChange={(value) => updateSettings({ vatRate: Number(value.replace(",", ".")) })}
          />
          <Field
            label="מזומן במגירה בתחילת היום"
            value={String(settings.openingFloat)}
            ltr
            onChange={(value) => updateSettings({ openingFloat: Number(value.replace(",", ".")) })}
          />
          <p className="text-sm text-muted">המחירים במדף הם מחירי צרכן וכוללים מע״מ. ברירת המחדל היא 18%, השיעור הנהוג כיום.</p>
        </section>
        <section className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div>
            <h2 className="text-base font-semibold">מסופי אשראי</h2>
            <p className="mt-1 text-sm text-pretty text-muted">
              אשראי וכרטיס מועדון נשלחים מהקופה עצמה אל המכשיר לפי כתובת ה-IP. אותה כתובת מוגדרת כאן וגם במסופון או בפינפד. אם הדפדפן חוסם פנייה לכתובת רגילה, מסמנים שהמסוף בכתובת מאובטחת.
            </p>
          </div>
          <EndpointFields kind="android" value={settings.androidTerminal} onSave={(endpoint) => updateSettings({ androidTerminal: endpoint })} />
          <EndpointFields kind="pinpad" value={settings.pinpad} onSave={(endpoint) => updateSettings({ pinpad: endpoint })} />
          <p className="text-xs text-pretty text-muted">
            המכשיר עונה ל־/pay בכתובת הזו, עם הסכום, מספר התשלומים, והסוג credit או club, ומחזיר approved ומספר אישור.
          </p>
        </section>
        <section className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">התקנה על אנדרואיד</h2>
          <p className="text-sm text-pretty text-muted">
            הקופה מותאמת לטלפון ולטאבלט ועובדת במסך מלא. בכרום: תפריט ← הוספה למסך הבית. האייקון נפתח כמו אפליקציה, והמכירות נשמרות במכשיר הזה.
          </p>
          <p className="text-sm text-pretty text-muted">
            אין כאן קובץ APK להורדה. התקנה חתומה לאפליקציית אנדרואיד דורשת בניין נפרד מחוץ לקופה הזו. במכשיר: תפריט הדפדפן ← הוספה למסך הבית, והאייקון נפתח במסך מלא. המכירות נשמרות במכשיר.
          </p>
        </section>
        <section className="space-y-2 rounded-2xl bg-copper-soft p-4">
          <h2 className="text-base font-semibold text-copper">נתונים במכשיר</h2>
          <p className="text-sm text-ink">
            הקבלות כאן הן לניהול פנימי. הן אינן חשבונית מס ממוחשבת ואינן מחליפות תוכנה מאושרת מול רשות המסים.
          </p>
          {armed === "history" ? (
            <Confirm
              text="למחוק את כל הקבלות והסלים? המוצרים יישארו."
              onCancel={() => setArmed("none")}
              onYes={() => {
                clearHistory();
                setArmed("none");
              }}
            />
          ) : (
            <button type="button" onClick={() => setArmed("history")} className="h-12 w-full rounded-2xl bg-surface text-sm font-medium">
              קופה נקייה
            </button>
          )}
          {isDemoMode() ? (
            armed === "demo" ? (
              <Confirm
                text="לשחזר את מכולת ההדגמה? המוצרים, הפרטים והקבלות הנוכחיים יוחלפו."
                onCancel={() => setArmed("none")}
                onYes={() => {
                  resetDemo();
                  setArmed("none");
                }}
              />
            ) : (
              <button type="button" onClick={() => setArmed("demo")} className="min-h-12 w-full rounded-2xl bg-surface px-3 text-sm font-medium">
                שחזור נתוני הדגמה
              </button>
            )
          ) : null}
        </section>
      </div>
    </div>
  );
}

function KioskTiming() {
  const settings = usePos((state) => state.settings);
  const updateSettings = usePos((state) => state.updateSettings);
  const timing = kioskTiming(settings);
  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="text-base font-semibold">קיוסק</h2>
      <p className="text-sm text-pretty text-muted">אחרי שקט, הקיוסק שואל אם מישהו עדיין כאן ואז חוזר למסך הפתיחה.</p>
      <label className="block text-sm text-muted">
        שניות עד השאלה
        <input
          value={timing.idle}
          onChange={(event) => updateSettings({ kioskIdleSec: Number(event.target.value) })}
          inputMode="numeric"
          dir="ltr"
          className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
        />
      </label>
      <label className="block text-sm text-muted">
        שניות בספירה לאחור
        <input
          value={timing.warn}
          onChange={(event) => updateSettings({ kioskWarnSec: Number(event.target.value) })}
          inputMode="numeric"
          dir="ltr"
          className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
        />
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={timing.lock}
        onClick={() => updateSettings({ kioskLock: !timing.lock })}
        className={`min-h-12 w-full rounded-xl px-3 py-2 text-sm font-medium text-pretty ${timing.lock ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
      >
        {timing.lock ? "נעילת קיוסק פעילה. יציאה רק עם קוד מנהל" : "נעילת קיוסק כבויה"}
      </button>
    </section>
  );
}

function EndpointFields({
  kind,
  value,
  onSave,
}: {
  kind: TerminalKind;
  value: TerminalEndpoint;
  onSave: (endpoint: TerminalEndpoint) => void;
}) {
  const [ip, setIp] = useState(value.ip);
  const [port, setPort] = useState(String(value.port));
  const [secure, setSecure] = useState(value.https);
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setIp(value.ip);
    setPort(String(value.port));
    setSecure(value.https);
  }, [value.ip, value.port, value.https]);

  function commit(nextSecure = secure) {
    const nextPort = Number(port);
    if (ip.trim() && !isSafeIpv4(ip.trim())) {
      setNote("כתובת לא תקינה. לדוגמה 192.168.1.50");
      return null;
    }
    if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65535) {
      setNote("פורט בין 1 ל־65535");
      return null;
    }
    const next = { ip: ip.trim(), port: nextPort, https: nextSecure };
    setNote("");
    onSave(next);
    return next;
  }

  return (
    <div className="space-y-2 rounded-2xl bg-paper p-3">
      <h3 className="text-sm font-semibold">{deviceLabel(kind)}</h3>
      <label className="block text-sm text-muted">
        כתובת IP
        <input
          value={ip}
          onChange={(event) => setIp(event.target.value.replace(/[^\d.]/g, "").slice(0, 15))}
          onBlur={() => commit()}
          dir="ltr"
          inputMode="decimal"
          placeholder="192.168.1.50"
          className="mt-1 h-12 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line tabular-nums"
        />
      </label>
      <label className="block text-sm text-muted">
        פורט
        <input
          value={port}
          onChange={(event) => setPort(event.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => commit()}
          dir="ltr"
          inputMode="numeric"
          className="mt-1 h-12 w-full rounded-xl bg-surface px-3 text-ink ring-1 ring-line tabular-nums"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          const next = !secure;
          setSecure(next);
          commit(next);
        }}
        className={`h-12 w-full rounded-xl text-sm ${secure ? "bg-pine-soft font-medium text-pine" : "bg-surface ring-1 ring-line"}`}
      >
        {secure ? "המסוף בכתובת מאובטחת" : "המסוף בכתובת רגילה ברשת"}
      </button>
      <button
        type="button"
        disabled={checking}
        onClick={() => {
          const next = commit();
          if (!next) return;
          setChecking(true);
          void pingTerminal(next).then((result) => {
            setNote(result.message);
            setChecking(false);
          });
        }}
        className="h-12 w-full rounded-xl bg-surface text-sm font-medium ring-1 ring-line disabled:opacity-50"
      >
        {checking ? "בודקים…" : "בדיקת חיבור"}
      </button>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ltr?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        dir={ltr ? "ltr" : undefined}
        className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
      />
    </label>
  );
}

function Confirm({ text, onCancel, onYes }: { text: string; onCancel: () => void; onYes: () => void }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <p className="text-sm">{text}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl bg-paper text-sm">
          ביטול
        </button>
        <button type="button" onClick={onYes} className="h-12 rounded-xl bg-copper text-sm font-semibold text-pine-ink">
          אישור
        </button>
      </div>
    </div>
  );
}
