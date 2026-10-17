import { userFromSession } from "./session-user";

/** Normalized user shape. The register does not sign customers in. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

/**
 * There is no public session. Always signed out, never pending, so a fresh
 * install does not call a sign-in endpoint or read a missing user id.
 */
export function useCurrentUserState(): CurrentUserState {
  return { user: null, isPending: false };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}

export { userFromSession };
