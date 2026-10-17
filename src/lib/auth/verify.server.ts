import { getRequest } from "@tanstack/react-start/server";
import { adminFromRequest, ownerForDeviceToken, requireAdminSession } from "./admin.server";
import { OWNER_ID } from "./owner";

/**
 * Back-office and device checks. There is no public account and no dev-user fallback.
 */

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function getSessionUser(): Promise<{ id: string; email: string | null } | null> {
  const request = getRequest();
  if (!request) return null;
  if (!(await adminFromRequest(request))) return null;
  return { id: OWNER_ID, email: null };
}

/** Admin cookie, or throw. Server functions that read or write the cloud use this. */
export async function requireUserId(): Promise<string> {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") throw new UnauthorizedError();
    throw error;
  }
  return OWNER_ID;
}

/** Phone sync bearer. A device token, never the admin cookie. */
export async function requireDeviceOwner(token: string | undefined): Promise<string> {
  if (!token) throw new UnauthorizedError();
  const owner = await ownerForDeviceToken(token);
  if (!owner) throw new UnauthorizedError();
  return owner;
}
