import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" && search.next.startsWith("/") && !search.next.startsWith("//") ? search.next : "",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const next = Route.useSearch().next;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !isPending && user && next) window.location.assign(next);
  }, [mounted, isPending, user, next]);
  if (!mounted || isPending || (user && next)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper text-ink">
        <p className="text-sm text-muted">טוענים את החשבון…</p>
      </main>
    );
  }
  if (user) return <Navigate to="/admin" />;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-paper px-4 text-ink">
      <h1 className="text-2xl font-semibold">כניסה לקופהקל</h1>
      <p className="mt-2 text-sm text-muted">החשבון מנהל עסקים ומשתמשים בענן. בקופה עצמה נכנסים עם קוד, גם בלי רשת.</p>
      <div className="mt-6 space-y-2">
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            type="button"
            onClick={() => signIn(provider.providerId, { callbackURL: next || "/admin" })}
            className="h-12 w-full rounded-2xl bg-pine font-semibold text-pine-ink"
          >
            המשך עם {provider.label}
          </button>
        ))}
      </div>
      <Link to="/" className="mt-6 text-center text-sm font-medium text-pine">
        חזרה לקופה
      </Link>
    </main>
  );
}
