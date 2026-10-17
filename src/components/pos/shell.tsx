import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Boxes, LockKeyhole, Receipt, Settings2, ShoppingCart } from "lucide-react";
import { AppUpdateBanner } from "@/components/pos/app-update";
import { CloudSync, SyncIndicator } from "@/components/pos/cloud-bar";
import { areaForPath, can } from "@/lib/pos/access";
import { prepareNative } from "@/lib/pos/native";
import { LockScreen } from "@/components/pos/lock-screen";
import { ReceiptView } from "@/components/pos/receipt";
import { ZReportView } from "@/components/pos/z-report";
import { currentUser, ensureReady, isWeekLocked, usePos } from "@/lib/pos/store";
import type { Role } from "@/lib/pos/types";

const NAV: { to: "/" | "/receipts" | "/inventory" | "/reports" | "/manage"; label: string; icon: typeof ShoppingCart; area: "sale" | "receipts" | "inventory" | "reports" | "manage" }[] = [
  { to: "/", label: "מכירה", icon: ShoppingCart, area: "sale" },
  { to: "/receipts", label: "קבלות", icon: Receipt, area: "receipts" },
  { to: "/inventory", label: "מלאי", icon: Boxes, area: "inventory" },
  { to: "/reports", label: "דוח", icon: BarChart3, area: "reports" },
  { to: "/manage", label: "ניהול", icon: Settings2, area: "manage" },
];

function WeekLock() {
  const lock = usePos((state) => state.lock);
  return (
    <main className="scroll-pane flex min-h-0 flex-1 flex-col bg-paper text-ink">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-copper text-lg font-bold text-pine-ink">₪</span>
        <h1 className="mt-4 text-2xl font-semibold">הקופה נעולה</h1>
        <p className="mt-2 text-sm text-pretty text-muted">
          עבר שבוע בלי חיבור לענן. המכירות שנשמרו במכשיר לא נמחקו, אבל אי אפשר למכור עד שהבעלים משחרר את הנעילה והקופה מתחברת שוב לרשת.
        </p>
        <button type="button" onClick={lock} className="mt-6 h-12 rounded-2xl bg-surface text-sm ring-1 ring-line">
          חזרה לכניסה
        </button>
      </div>
    </main>
  );
}

function BootScreen() {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-paper text-ink">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pine text-2xl font-bold text-pine-ink">₪</div>
      <h1 className="text-2xl font-semibold">קופהקל</h1>
      <p className="text-muted">פותחים את המגירה…</p>
    </main>
  );
}

function navClass(active: boolean, side: boolean) {
  const base = side
    ? "flex w-full min-h-12 flex-col items-center justify-center gap-2 rounded-2xl px-1 text-xs"
    : "flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-2 rounded-2xl px-1 text-xs";
  return `${base} ${active ? "bg-pine-soft font-semibold text-pine" : "text-muted"}`;
}

function NavLinks({ side, role }: { side: boolean; role: Role }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const items = NAV.filter((item) => can(role, item.area));
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to;
        return (
          <Link key={item.to} to={item.to} className={navClass(active, side)} aria-current={active ? "page" : undefined}>
            <Icon className="size-6" strokeWidth={1.75} />
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function PosFrame({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const receiptToPrint = usePos((state) => state.receiptToPrint);
  const zToPrint = usePos((state) => state.zToPrint);
  const user = usePos(currentUser);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const lock = usePos((state) => state.lock);
  const businessName = usePos((state) => state.settings.businessName);
  const lastGoodSync = usePos((state) => state.lastGoodSync);
  const appliedReleaseAt = usePos((state) => state.appliedReleaseAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await usePos.persist.rehydrate();
      } catch {
        // Keep the in-memory catalog if storage is unavailable.
      }
      ensureReady();
      if (live) setReady(true);
    })();
    prepareNative();
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  if (pathname.startsWith("/r/")) {
    return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
  }

  if (!ready) {
    return (
      <div className="shell-safe">
        <BootScreen />
      </div>
    );
  }

  if (pathname.startsWith("/admin")) {
    return (
      <>
        <AppUpdateBanner />
        <CloudSync />
        <div className="shell-safe">
          <div className="scroll-pane min-h-0 flex-1">{children}</div>
        </div>
      </>
    );
  }

  if (pathname.startsWith("/kiosk")) {
    return (
      <>
        <AppUpdateBanner />
        <CloudSync />
        <div className="shell-safe">{isWeekLocked(lastGoodSync, appliedReleaseAt, now) ? <WeekLock /> : <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>}</div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AppUpdateBanner />
        <CloudSync />
        <div className="shell-safe">
          <LockScreen />
        </div>
      </>
    );
  }

  if (isWeekLocked(lastGoodSync, appliedReleaseAt, now)) {
    return (
      <>
        <AppUpdateBanner />
        <CloudSync />
        <div className="shell-safe">
          <WeekLock />
        </div>
      </>
    );
  }

  const allowed = can(user.role, areaForPath(pathname));

  return (
    <>
      <AppUpdateBanner />
      <CloudSync />
      <div className="pos-frame shell-safe flex-row overflow-hidden">
        <nav className="no-print hidden w-24 shrink-0 flex-col gap-2 border-e border-line bg-surface p-2 lg:flex">
          <div className="mb-2 flex flex-col items-center px-1 pt-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine text-lg font-bold text-pine-ink">₪</span>
            <span className="mt-2 text-sm font-semibold">קופהקל</span>
            <span className="mt-1 line-clamp-2 text-xs text-muted">{user.name}</span>
          </div>
          <NavLinks side role={user.role} />
          <button type="button" onClick={lock} className="mt-auto flex min-h-12 flex-col items-center justify-center gap-2 rounded-2xl text-xs text-muted">
            <LockKeyhole className="size-5" />
            נעילה
          </button>
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <SyncIndicator />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {allowed ? (
              children
            ) : (
              <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <h1 className="text-xl font-semibold">אין הרשאה</h1>
                <p className="text-sm text-muted">המסך הזה שמור לתפקיד אחר ב{businessName}.</p>
                <Link to="/" className="flex h-12 items-center rounded-2xl bg-pine px-5 font-semibold text-pine-ink">
                  חזרה למכירה
                </Link>
              </main>
            )}
          </div>
          <nav className="app-nav-bottom safe-bottom no-print flex shrink-0 gap-2 border-t border-line bg-surface px-2 pt-2 lg:hidden">
            <NavLinks side={false} role={user.role} />
          </nav>
        </div>
      </div>
      {receiptToPrint ? (
        <div className="print-root">
          <ReceiptView sale={receiptToPrint} />
        </div>
      ) : null}
      {zToPrint ? (
        <div className="print-root">
          <ZReportView report={zToPrint} />
        </div>
      ) : null}
    </>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="shrink-0 px-3 pt-4 pb-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}