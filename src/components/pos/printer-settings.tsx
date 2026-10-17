import { useEffect, useState } from "react";
import { askUsbPermission, printTestReceipt, readUsbPrinters } from "@/lib/pos/receipt-io";
import { hasUsbPrint } from "@/lib/pos/native";
import { DEFAULT_PRINTER_NAME, type UsbPrinterInfo } from "@/lib/pos/printer";
import { usePos } from "@/lib/pos/store";

export function PrinterSettings() {
  const settings = usePos((state) => state.settings);
  const updateSettings = usePos((state) => state.updateSettings);
  const [printers, setPrinters] = useState<UsbPrinterInfo[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const native = hasUsbPrint();
  const auto = settings.autoPrint !== false;
  const drawer = settings.openDrawer !== false;
  const paper = settings.paperWidth === 58 ? 58 : 80;
  const selected = (settings.printerName || DEFAULT_PRINTER_NAME).trim();

  function refresh() {
    setPrinters(readUsbPrinters());
  }

  useEffect(() => {
    refresh();
    const onUsb = () => refresh();
    window.addEventListener("liitpos-usb", onUsb);
    return () => window.removeEventListener("liitpos-usb", onUsb);
  }, []);

  return (
    <section className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div>
        <h2 className="text-base font-semibold">הדפסת קבלות</h2>
        <p className="mt-1 text-sm text-pretty text-muted">
          אחרי כל תשלום, כולל פיצול תשלום ותעודת זיכוי, הקבלה יוצאת מיד. באנדרואיד היא נשלחת למדפסת USB בשם {DEFAULT_PRINTER_NAME}. אם אין מדפסת בשם הזה, נבחרת מדפסת ה-USB הראשונה, ואם אין בכלל — נפתחת הדפסת המערכת.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={auto}
        onClick={() => updateSettings({ autoPrint: !auto })}
        className={`h-12 w-full rounded-xl text-sm font-medium ${auto ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
      >
        {auto ? "הדפסה אוטומטית פעילה" : "הדפסה אוטומטית כבויה"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {([58, 80] as const).map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => updateSettings({ paperWidth: width })}
            className={`h-12 rounded-xl text-sm font-medium ${paper === width ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
          >
            {width} מ״מ
          </button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={drawer}
        onClick={() => updateSettings({ openDrawer: !drawer })}
        className={`h-12 w-full rounded-xl text-sm font-medium ${drawer ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
      >
        {drawer ? "פתיחת מגירה בתשלום מזומן" : "בלי פתיחת מגירה אוטומטית"}
      </button>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">שם המדפסת</span>
        <input
          value={selected}
          onChange={(event) => updateSettings({ printerName: event.target.value })}
          dir="ltr"
          className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
        />
      </label>
      <button type="button" onClick={() => updateSettings({ printerName: DEFAULT_PRINTER_NAME })} className="h-12 w-full rounded-xl bg-paper text-sm ring-1 ring-line">
        בחירה בשם {DEFAULT_PRINTER_NAME}
      </button>
      {native ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">מדפסות USB</h3>
            <button type="button" onClick={refresh} className="h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line">
              רענון
            </button>
          </div>
          {printers.length === 0 ? (
            <p className="text-sm text-muted">לא נמצאה מדפסת. מחברים את המדפסת בכבל USB ומאשרים את ההרשאה פעם אחת.</p>
          ) : (
            <ul className="space-y-2">
              {printers.map((printer) => {
                const label = printer.name.trim() || "בלי שם";
                const chosen = printer.name.trim().toLocaleLowerCase() === selected.toLocaleLowerCase();
                return (
                  <li key={printer.deviceName} className="rounded-xl bg-paper p-3 ring-1 ring-line">
                    <button type="button" onClick={() => printer.name.trim() && updateSettings({ printerName: printer.name.trim() })} className="block w-full text-start" disabled={!printer.name.trim()}>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {printer.deviceName}
                        {printer.printer ? " · printer" : ""}
                        {chosen ? " · נבחרה" : ""}
                        {printer.hasPermission ? "" : " · אין הרשאה"}
                      </span>
                    </button>
                    {printer.hasPermission ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setNote("ממתינים לאישור USB…");
                          void askUsbPermission(printer.deviceName).then((granted) => {
                            refresh();
                            setNote(granted ? "ההרשאה נשמרה." : "ההרשאה לא אושרה. אפשר לנסות שוב מכאן.");
                          });
                        }}
                        className="mt-2 h-12 w-full rounded-xl bg-surface text-sm font-medium ring-1 ring-line"
                      >
                        אישור חיבור
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">בדפדפן ההדפסה נפתחת בחלון ההדפסה של המערכת. מדפסת ה-USB זמינה באפליקציית האנדרואיד.</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setNote("שולחים בדיקה…");
          void printTestReceipt().then((result) => {
            setNote(result === "usb" ? "נשלח למדפסת USB." : "אין מדפסת USB. נפתחה הדפסת המערכת.");
            setBusy(false);
          });
        }}
        className="h-12 w-full rounded-xl bg-pine text-sm font-semibold text-pine-ink disabled:opacity-50"
      >
        {busy ? "מדפיסים…" : "הדפסת ניסיון"}
      </button>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </section>
  );
}
