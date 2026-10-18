import { useEffect, useState } from "react";
import { LegacyTokens, RegistersAdmin } from "@/components/pos/registers-admin";
import {
  deleteCloudBusiness,
  deleteCloudUser,
  loadBusinessData,
  loadPanel,
  releaseCloudLock,
  saveCloudBusiness,
  saveCloudUser,
  type BusinessData,
  type PanelBusiness,
  type PanelDevice,
  type PanelUser,
} from "@/lib/pos/cloud.functions";
import { compressImage } from "@/lib/pos/image";
import { formatILS, formatWhen } from "@/lib/pos/money";
import { usePos } from "@/lib/pos/store";
import { syncNow } from "@/lib/pos/sync";
import { METHOD_LABEL, ROLE_LABEL, STOCK_REASON_LABEL, type PaymentMethod, type Role, type StaffUser, type StockReason } from "@/lib/pos/types";

const ROLES: Role[] = ["cashier", "shift", "manager"];

type BusinessDraft = {
  id: string | null;
  businessName: string;
  ownerName: string;
  taxId: string;
  address: string;
  phone: string;
  vatRate: string;
  code: string;
  logo: string | null;
};

function emptyBusiness(): BusinessDraft {
  return { id: null, businessName: "", ownerName: "", taxId: "", address: "", phone: "", vatRate: "18", code: "", logo: null };
}

function messageOf(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    if (message && message !== "Unauthorized" && !message.startsWith("[")) return message;
  }
  return "הפעולה לא נשמרה. אם אין רשת, נסו שוב כשהחיבור חוזר.";
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 py-8">
      <h1 className="text-2xl font-semibold">לוח בקרה</h1>
      <p className="mt-2 text-sm text-muted">כניסה לבעלים בלבד. אין הרשמה, ואין קישור לכאן מתוך הקופה.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void fetch("/api/admin/login", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password }),
          })
            .then(async (response) => {
              if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                setError(body?.error || "הכניסה נדחתה.");
                return;
              }
              setPassword("");
              onSuccess();
            })
            .catch(() => setError("הכניסה נדחתה."))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-muted">שם משתמש</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">סיסמה</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line"
          />
        </label>
        {error ? <p className="text-sm text-copper">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-2xl bg-pine font-semibold text-pine-ink disabled:opacity-50">
          כניסה
        </button>
      </form>
    </main>
  );
}

export function AdminPage() {
  const [gate, setGate] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/session", { credentials: "same-origin" })
      .then((response) => {
        if (live) setGate(response.ok ? "in" : "out");
      })
      .catch(() => {
        if (live) setGate("out");
      });
    return () => {
      live = false;
    };
  }, []);
  if (gate === "loading") {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-sm text-muted">טוענים את החשבון…</p>
      </main>
    );
  }
  if (gate === "out") return <LoginForm onSuccess={() => setGate("in")} />;
  return <Panel onLogout={() => setGate("out")} />;
}

function Panel({ onLogout }: { onLogout: () => void }) {
  const [businesses, setBusinesses] = useState<PanelBusiness[]>([]);
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [devices, setDevices] = useState<PanelDevice[]>([]);
  const [releasedAt, setReleasedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [businessDraft, setBusinessDraft] = useState<BusinessDraft | null>(null);
  const [userDraft, setUserDraft] = useState<StaffUser | null>(null);
  const [confirmBusiness, setConfirmBusiness] = useState(false);
  const [confirmUser, setConfirmUser] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(prefer?: string) {
    const data = await loadPanel();
    setBusinesses(data.businesses);
    setUsers(data.users);
    setDevices(data.devices);
    setReleasedAt(data.releasedAt);
    setSelectedId((current) => prefer || current || data.businesses[0]?.id || null);
  }

  useEffect(() => {
    let live = true;
    void loadPanel()
      .then((data) => {
        if (!live) return;
        setBusinesses(data.businesses);
        setUsers(data.users);
        setDevices(data.devices);
        setReleasedAt(data.releasedAt);
        setSelectedId(data.businesses[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (live) setError(messageOf(reason));
      });
    return () => {
      live = false;
    };
  }, []);

  const selected = businesses.find((item) => item.id === selectedId) ?? null;
  const visibleUsers = users.filter((user) => user.storeIds.length === 0 || (selectedId ? user.storeIds.includes(selectedId) : false));

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
      await syncNow();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <header className="flex items-start justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-xs font-semibold text-pine">קופהקל</p>
          <h1 className="text-2xl font-semibold">לוח בקרה</h1>
          <p className="text-sm text-muted">בעלים</p>
        </div>
        <button
          type="button"
          className="flex h-12 items-center rounded-xl bg-paper px-3 text-sm ring-1 ring-line"
          onClick={() => {
            void fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).finally(onLogout);
          }}
        >
          יציאה
        </button>
      </header>
      <div className="space-y-3 px-4 pb-10">
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">נעילת שבוע</h2>
          <p className="mt-1 text-sm text-muted">קופה שלא דיברה עם הענן שבעה ימים ננעלת למכירה. השחרור נכנס לתוקף כשהיא מתחברת שוב. המכירות שנשמרו במכשיר לא נמחקות.</p>
          {releasedAt ? <p className="mt-2 text-sm">שחרור אחרון: {formatWhen(releasedAt)}</p> : <p className="mt-2 text-sm text-muted">עדיין לא שוחררה נעילה מהלוח הזה.</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await releaseCloudLock();
                setReleasedAt(result.releasedAt);
                await refresh();
              })
            }
            className="mt-3 h-12 rounded-xl bg-pine px-4 text-sm font-semibold text-pine-ink disabled:opacity-50"
          >
            שחרור נעילה
          </button>
          {devices.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {devices.map((device) => (
                <li key={device.id} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                  <span className="font-medium">{device.businessName || "קופה"}</span>
                  {device.businessCode ? <span className="tabular-nums" dir="ltr"> · {device.businessCode}</span> : null}
                  <span className={device.locked ? "text-copper" : "text-pine"}>{device.locked ? " · נעולה" : " · פעילה"}</span>
                  <span className="text-muted"> · נראתה {formatWhen(device.lastSeen)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">עדיין אין דיווח מקופה מחוברת. אחרי סנכרון תופיע כאן.</p>
          )}
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">עסקים</h2>
            <button
              type="button"
              onClick={() => {
                setError("");
                setBusinessDraft(emptyBusiness());
              }}
              className="h-12 rounded-xl bg-pine px-3 text-sm font-semibold text-pine-ink"
            >
              עסק חדש
            </button>
          </div>
          <p className="mt-2 text-sm text-pretty text-muted">רק מכאן מוסיפים קופה. בקופה עצמה אין שדה לכתובת שרת, ואין דרך לשייך מכשיר.</p>
          {businesses.length === 0 ? (
            <p className="mt-3 text-sm text-muted">עדיין אין עסקים בענן. יוצרים כאן, או פותחים את הקופה — מה ששמור במכשיר יעלה אוטומטית כשיש רשת.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {businesses.map((business) => (
                <li key={business.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(business.id);
                      setConfirmBusiness(false);
                      setBusinessDraft(null);
                    }}
                    className={`w-full rounded-2xl px-3 py-3 text-start ring-1 ring-line ${selectedId === business.id ? "bg-pine-soft" : "bg-paper"}`}
                  >
                    <span className="block font-medium">{business.settings.businessName}</span>
                    <span className="text-sm tabular-nums text-muted" dir="ltr">
                      {business.settings.code}
                    </span>
                    <span className="block text-sm text-muted">
                      {business.settings.address || "בלי כתובת"} · {business.sales} קבלות בענן
                    </span>
                  </button>
                  <RegistersAdmin businessId={business.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <LegacyTokens />

        {selected ? (
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{selected.settings.businessName}</h2>
                <p className="text-sm text-muted">
                  מזהה כניסה <span className="font-semibold tabular-nums text-ink" dir="ltr">{selected.settings.code}</span>
                </p>
                <p className="text-sm text-muted">
                  {selected.settings.ownerName || "בלי שם בעלים"}
                  {selected.settings.taxId ? ` · עוסק ${selected.settings.taxId}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBusinessDraft({
                    id: selected.id,
                    businessName: selected.settings.businessName,
                    ownerName: selected.settings.ownerName,
                    taxId: selected.settings.taxId,
                    address: selected.settings.address,
                    phone: selected.settings.phone,
                    vatRate: String(selected.settings.vatRate),
                    code: selected.settings.code,
                    logo: selected.settings.logo,
                  })
                }
                className="h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line"
              >
                עריכה
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <h3 className="font-medium">משתמשים בעסק</h3>
              <button
                type="button"
                onClick={() => {
                  setConfirmUser(false);
                  setUserDraft({
                    id: `u_${crypto.randomUUID().slice(0, 8)}`,
                    name: "",
                    pin: "",
                    role: "cashier",
                    active: true,
                    storeIds: [selected.id],
                  });
                }}
                className="h-12 rounded-xl bg-paper px-3 text-sm ring-1 ring-line"
              >
                משתמש חדש
              </button>
            </div>
            {visibleUsers.length === 0 ? <p className="mt-3 text-sm text-muted">אין משתמשים לעסק הזה.</p> : null}
            <ul className="mt-3 space-y-2">
              {visibleUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmUser(false);
                      setUserDraft(user);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl bg-paper px-3 py-3 text-start ring-1 ring-line"
                  >
                    <span>
                      <span className="block font-medium">{user.name}</span>
                      <span className="text-sm text-muted">
                        {ROLE_LABEL[user.role]}
                        {user.storeIds.length === 0 ? " · כל העסקים" : ""}
                        {user.active ? "" : " · מושבת"}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-muted" dir="ltr">
                      {user.pin}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {confirmBusiness ? (
              <div className="mt-4 rounded-2xl bg-copper-soft p-3">
                <p className="text-sm">למחוק את {selected.settings.businessName}? המשתמשים שמשויכים רק אליו יימחקו. קבלות שכבר בענן נשארות בארכיון.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirmBusiness(false)} className="h-12 rounded-xl bg-surface text-sm">
                    ביטול
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await deleteCloudBusiness({ data: selected.id });
                        setConfirmBusiness(false);
                        await refresh();
                      })
                    }
                    className="h-12 rounded-xl bg-copper text-sm font-semibold text-pine-ink"
                  >
                    מחיקה
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmBusiness(true)} className="mt-4 h-12 text-sm font-medium text-copper">
                מחיקת העסק
              </button>
            )}
            <DataBrowser businessId={selected.id} />
          </section>
        ) : null}
        {error ? <p className="text-sm text-copper">{error}</p> : null}
      </div>

      {businessDraft ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
          <form
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const saved = await saveCloudBusiness({
                  data: {
                    id: businessDraft.id,
                    businessName: businessDraft.businessName,
                    ownerName: businessDraft.ownerName,
                    taxId: businessDraft.taxId,
                    address: businessDraft.address,
                    phone: businessDraft.phone,
                    vatRate: Number(businessDraft.vatRate.replace(",", ".")),
                    code: businessDraft.code,
                    logo: businessDraft.logo,
                  },
                });
                usePos.getState().rememberBusinessSettings(saved.id, {
                  businessName: businessDraft.businessName.trim(),
                  ownerName: businessDraft.ownerName.trim(),
                  taxId: businessDraft.taxId.trim(),
                  address: businessDraft.address.trim(),
                  phone: businessDraft.phone.trim(),
                  vatRate: Number(businessDraft.vatRate.replace(",", ".")) || 18,
                  code: saved.code,
                  logo: businessDraft.logo,
                });
                setBusinessDraft(null);
                await refresh(saved.id);
              });
            }}
          >
            <h2 className="text-lg font-semibold">{businessDraft.id ? "עריכת עסק" : "עסק חדש"}</h2>
            <label className="mt-3 block text-sm text-muted">
              שם העסק
              <input value={businessDraft.businessName} onChange={(event) => setBusinessDraft({ ...businessDraft, businessName: event.target.value })} className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              בעלים
              <input value={businessDraft.ownerName} onChange={(event) => setBusinessDraft({ ...businessDraft, ownerName: event.target.value })} className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              עוסק מורשה
              <input value={businessDraft.taxId} onChange={(event) => setBusinessDraft({ ...businessDraft, taxId: event.target.value })} dir="ltr" className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              כתובת
              <input value={businessDraft.address} onChange={(event) => setBusinessDraft({ ...businessDraft, address: event.target.value })} className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              טלפון
              <input value={businessDraft.phone} onChange={(event) => setBusinessDraft({ ...businessDraft, phone: event.target.value })} dir="ltr" className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              מזהה כניסה (6 ספרות, ריק = אוטומטי)
              <input
                value={businessDraft.code}
                onChange={(event) => setBusinessDraft({ ...businessDraft, code: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                dir="ltr"
                inputMode="numeric"
                className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
              />
            </label>
            <label className="mt-3 block text-sm text-muted">
              מע״מ %
              <input value={businessDraft.vatRate} onChange={(event) => setBusinessDraft({ ...businessDraft, vatRate: event.target.value })} dir="ltr" inputMode="decimal" className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <div className="mt-3 flex items-center gap-3">
              {businessDraft.logo ? (
                <img src={businessDraft.logo} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-pine text-lg font-bold text-pine-ink">₪</span>
              )}
              <div>
                <p className="text-sm text-muted">לוגו לכניסה ולמסך המכירה</p>
                <div className="mt-1 flex gap-2">
                  <label className="flex h-12 cursor-pointer items-center rounded-xl bg-paper px-3 text-sm text-ink ring-1 ring-line">
                    העלאה
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        void compressImage(file, 320).then((logo) => setBusinessDraft((current) => (current ? { ...current, logo } : current)));
                      }}
                    />
                  </label>
                  {businessDraft.logo ? (
                    <button type="button" onClick={() => setBusinessDraft({ ...businessDraft, logo: null })} className="h-12 px-2 text-sm text-copper">
                      הסרה
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBusinessDraft(null)} className="h-12 rounded-2xl bg-paper">
                ביטול
              </button>
              <button type="submit" disabled={busy} className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink disabled:opacity-50">
                שמירה
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {userDraft ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
          <form
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const saved = await saveCloudUser({ data: userDraft });
                setUserDraft(null);
                await refresh(selectedId ?? undefined);
                void saved;
              });
            }}
          >
            <h2 className="text-lg font-semibold">משתמש</h2>
            <label className="mt-3 block text-sm text-muted">
              שם
              <input value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line" />
            </label>
            <label className="mt-3 block text-sm text-muted">
              קוד 4 ספרות
              <input
                value={userDraft.pin}
                onChange={(event) => setUserDraft({ ...userDraft, pin: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                dir="ltr"
                inputMode="numeric"
                className="mt-1 h-12 w-full rounded-xl bg-paper px-3 text-ink ring-1 ring-line tabular-nums"
              />
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() =>
                    setUserDraft({
                      ...userDraft,
                      role,
                      storeIds: role === "manager" ? [] : userDraft.storeIds.length ? userDraft.storeIds : selectedId ? [selectedId] : [],
                    })
                  }
                  className={`h-12 rounded-xl text-sm ${userDraft.role === role ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}
                >
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              {userDraft.role === "manager" && userDraft.storeIds.length === 0
                ? "מנהל בלי שיוך נכנס לכל העסקים בחשבון."
                : "קופאי ואחראי נכנסים רק לעסקים שמשויכים אליהם."}
            </p>
            {userDraft.role !== "manager" && selected ? (
              <p className="mt-2 text-sm">משויך ל{selected.settings.businessName}</p>
            ) : null}
            <button type="button" onClick={() => setUserDraft({ ...userDraft, active: !userDraft.active })} className="mt-3 h-12 w-full rounded-xl bg-paper text-sm">
              {userDraft.active ? "פעיל" : "מושבת"}
            </button>
            {users.some((user) => user.id === userDraft.id) ? (
              confirmUser ? (
              <div className="mt-3 rounded-2xl bg-copper-soft p-3">
                <p className="text-sm">למחוק את {userDraft.name || "המשתמש"}?</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await deleteCloudUser({ data: userDraft.id });
                      setUserDraft(null);
                      setConfirmUser(false);
                      await refresh(selectedId ?? undefined);
                    })
                  }
                  className="mt-3 h-12 w-full rounded-xl bg-copper text-sm font-semibold text-pine-ink"
                >
                  מחיקה
                </button>
              </div>
              ) : (
              <button type="button" onClick={() => setConfirmUser(true)} className="mt-3 h-12 text-sm text-copper">
                מחיקת משתמש
              </button>
              )
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setUserDraft(null)} className="h-12 rounded-2xl bg-paper">
                ביטול
              </button>
              <button type="submit" disabled={busy} className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink disabled:opacity-50">
                שמירה
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function methodLabel(method: string) {
  return method in METHOD_LABEL ? METHOD_LABEL[method as PaymentMethod] : method || "—";
}

function reasonLabel(reason: string) {
  return reason in STOCK_REASON_LABEL ? STOCK_REASON_LABEL[reason as StockReason] : reason || "—";
}

function DataBrowser({ businessId }: { businessId: string }) {
  const [tab, setTab] = useState<"sales" | "products" | "stock" | "z">("sales");
  const [rows, setRows] = useState<BusinessData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setRows(null);
    setError("");
    void loadBusinessData({ data: businessId })
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((reason: unknown) => {
        if (live) setError(messageOf(reason));
      });
    return () => {
      live = false;
    };
  }, [businessId]);

  const tabs = [
    { id: "sales" as const, label: "מכירות" },
    { id: "products" as const, label: "מוצרים" },
    { id: "stock" as const, label: "מלאי" },
    { id: "z" as const, label: "דוח Z" },
  ];

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="font-medium">נתונים ב-SQL</h3>
      <p className="mt-1 text-sm text-muted">מוצרים, מכירות, תנועות מלאי ודוחות Z של העסק, כמו שהם שמורים בענן.</p>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-12 shrink-0 rounded-full px-3 text-sm ${tab === item.id ? "bg-pine font-semibold text-pine-ink" : "bg-paper ring-1 ring-line"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
      {!rows && !error ? <p className="mt-3 text-sm text-muted">טוענים את הנתונים…</p> : null}
      {rows && tab === "sales" ? (
        rows.sales.length === 0 ? (
          <p className="mt-3 text-sm text-muted">אין מכירות בענן לעסק הזה.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.sales.map((sale) => (
              <li key={sale.id} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    #{sale.number}
                    {sale.voided ? " · בוטל" : ""}
                  </span>
                  <span className="tabular-nums">{formatILS(sale.total)}</span>
                </div>
                <p className="text-muted">
                  {formatWhen(sale.createdAt)} · {methodLabel(sale.method)}
                  {sale.cashierName ? ` · ${sale.cashierName}` : ""}
                </p>
                {sale.summary ? <p className="truncate">{sale.summary}</p> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {rows && tab === "products" ? (
        rows.products.length === 0 ? (
          <p className="mt-3 text-sm text-muted">אין מוצרים בענן לעסק הזה.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.products.map((product) => (
              <li key={product.id} className="flex items-baseline justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                <span>
                  <span className="font-medium">{product.name}</span>
                  <span className="text-muted">
                    {product.favorite ? " · מועדף" : ""}
                    {product.active ? "" : " · מוסתר"}
                    {product.trackStock ? ` · מלאי ${product.stock}` : ""}
                  </span>
                </span>
                <span className="tabular-nums">{formatILS(product.price)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {rows && tab === "stock" ? (
        rows.moves.length === 0 ? (
          <p className="mt-3 text-sm text-muted">אין תנועות מלאי בענן.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.moves.map((move) => (
              <li key={move.id} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{move.productName}</span>
                  <span className="tabular-nums">{move.qty > 0 ? `+${move.qty}` : move.qty}</span>
                </div>
                <p className="text-muted">
                  {formatWhen(move.at)} · {reasonLabel(move.reason)}
                  {move.by ? ` · ${move.by}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {rows && tab === "z" ? (
        rows.reports.length === 0 ? (
          <p className="mt-3 text-sm text-muted">אין דוחות Z בענן.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.reports.map((report) => (
              <li key={report.id} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">Z {report.number}</span>
                  <span className="tabular-nums">{formatILS(report.turnover)}</span>
                </div>
                <p className="text-muted">
                  {formatWhen(report.closedAt)} · {report.salesCount} מכירות
                  {report.closedBy ? ` · ${report.closedBy}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

