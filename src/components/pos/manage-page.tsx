import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/pos/shell";
import { usePos } from "@/lib/pos/store";
import { ROLE_LABEL, type Role, type StaffUser } from "@/lib/pos/types";

const ROLES: Role[] = ["cashier", "shift", "manager"];

export function ManagePage() {
  const stores = usePos((state) => state.stores);
  const activeStoreId = usePos((state) => state.activeStoreId);
  const staff = usePos((state) => state.staff);
  const switchStore = usePos((state) => state.switchStore);
  const addStore = usePos((state) => state.addStore);
  const saveStaff = usePos((state) => state.saveStaff);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeTax, setStoreTax] = useState("");
  const [draft, setDraft] = useState<StaffUser | null>(null);
  const [staffError, setStaffError] = useState("");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="ניהול" subtitle="חנויות, צוות, מדף והגדרות העסק. המסך הזה למנהל." />
      <div className="space-y-3 px-3 pb-8">
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-base font-semibold">חנויות</h2>
          <ul className="mt-3 space-y-2">
            {stores.map((store) => (
              <li key={store.id} className="rounded-2xl bg-paper p-3 ring-1 ring-line">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{store.settings.businessName}</p>
                    <p className="text-sm text-muted">{store.settings.address}</p>
                    <p className="text-sm tabular-nums text-muted" dir="ltr">מזהה {store.settings.code}</p>
                    <p className="text-sm text-muted">{store.products.length} מוצרים · {store.sales.length} קבלות</p>
                  </div>
                  {store.id === activeStoreId ? (
                    <span className="rounded-full bg-pine-soft px-3 py-1 text-sm font-medium text-pine">פעילה</span>
                  ) : (
                    <button type="button" onClick={() => switchStore(store.id)} className="h-11 rounded-xl bg-pine px-3 text-sm font-semibold text-pine-ink">
                      מעבר
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!storeName.trim()) return;
              addStore({
                businessName: storeName.trim(),
                ownerName: "",
                taxId: storeTax.trim(),
                address: storeAddress.trim(),
                phone: "",
                receiptFooter: "תודה שקניתם אצלנו.",
                vatRate: 18,
                openingFloat: 0,
                code: "",
              });
              setStoreName("");
              setStoreAddress("");
              setStoreTax("");
            }}
          >
            <h3 className="text-sm font-medium">חנות חדשה</h3>
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="שם החנות" aria-label="שם החנות" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
            <input value={storeAddress} onChange={(event) => setStoreAddress(event.target.value)} placeholder="כתובת" aria-label="כתובת החנות" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
            <input value={storeTax} onChange={(event) => setStoreTax(event.target.value)} placeholder="עוסק מורשה" aria-label="עוסק מורשה" dir="ltr" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
            <button type="submit" className="h-12 w-full rounded-2xl bg-pine font-semibold text-pine-ink">
              הוספת חנות
            </button>
          </form>
        </section>
        <section className="grid grid-cols-2 gap-2">
          <Link to="/products" className="flex h-14 items-center justify-center rounded-2xl bg-surface font-medium ring-1 ring-line">
            מוצרים ומחירים
          </Link>
          <Link to="/settings" className="flex h-14 items-center justify-center rounded-2xl bg-surface font-medium ring-1 ring-line">
            פרטי העסק
          </Link>
          <Link to="/kiosk" className="col-span-2 flex h-14 items-center justify-center rounded-2xl bg-pine font-semibold text-pine-ink">
            פתיחת קיוסק ללקוחות
          </Link>
        </section>
        <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">צוות</h2>
            <button
              type="button"
              onClick={() => {
                setStaffError("");
                setDraft({ id: `u_${crypto.randomUUID()}`, name: "", pin: "", role: "cashier", active: true, storeIds: [activeStoreId] });
              }}
              className="h-11 rounded-xl bg-paper px-3 text-sm"
            >
              משתמש חדש
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {staff.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    setStaffError("");
                    setDraft(user);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl bg-paper px-3 py-3 text-start ring-1 ring-line"
                >
                  <span>
                    <span className="block font-medium">{user.name}</span>
                    <span className="text-sm text-muted">{ROLE_LABEL[user.role]}{user.active ? "" : " · מושבת"}</span>
                  </span>
                  <span className="text-sm text-muted" dir="ltr">{user.pin}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">הקודים עובדים גם בלי רשת. כשיש חיבור הם עולים לענן.</p>
        </section>
      </div>
      {draft ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center">
          <form
            role="dialog"
            aria-modal="true"
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 sm:rounded-3xl"
            onSubmit={(event) => {
              event.preventDefault();
              const error = saveStaff({ ...draft, storeIds: draft.role === "manager" ? [] : draft.storeIds });
              if (error) {
                setStaffError(error);
                return;
              }
              setDraft(null);
            }}
          >
            <h2 className="text-lg font-semibold">משתמש</h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">שם</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm text-muted">קוד 4 ספרות</span>
              <input value={draft.pin} onChange={(event) => setDraft({ ...draft, pin: event.target.value.replace(/\D/g, "").slice(0, 4) })} dir="ltr" inputMode="numeric" className="h-12 w-full rounded-xl bg-paper px-3 ring-1 ring-line tabular-nums" />
            </label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {ROLES.map((role) => (
                <button key={role} type="button" onClick={() => setDraft({ ...draft, role })} className={`h-11 rounded-xl text-sm ${draft.role === role ? "bg-pine text-pine-ink" : "bg-paper ring-1 ring-line"}`}>
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">חנויות שהמשתמש נכנס אליהן</p>
            <div className="mt-2 space-y-2">
              {stores.map((store) => {
                const checked = draft.role === "manager" || draft.storeIds.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    disabled={draft.role === "manager"}
                    onClick={() => {
                      const storeIds = draft.storeIds.includes(store.id)
                        ? draft.storeIds.filter((id) => id !== store.id)
                        : [...draft.storeIds, store.id];
                      setDraft({ ...draft, storeIds });
                    }}
                    className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm ${checked ? "bg-pine-soft text-pine" : "bg-paper ring-1 ring-line"}`}
                  >
                    {store.settings.businessName}
                    <span>{checked ? "משויך" : "לא"}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setDraft({ ...draft, active: !draft.active })} className="mt-3 h-11 w-full rounded-xl bg-paper text-sm">
              {draft.active ? "פעיל" : "מושבת"}
            </button>
            {staffError ? <p className="mt-2 text-sm text-copper">{staffError}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDraft(null)} className="h-12 rounded-2xl bg-paper">
                ביטול
              </button>
              <button type="submit" className="h-12 rounded-2xl bg-pine font-semibold text-pine-ink">
                שמירה
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
