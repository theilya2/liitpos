import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUserState } from "./use-current-user";

/**
 * Public sign-in is disabled. These gates stay so older call sites render
 * nothing instead of offering an account button.
 */

export const SIGN_IN_PATH = "/admin";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? null}</>;
}

export function SignInButtons() {
  return null;
}

export function UserButton() {
  return null;
}
