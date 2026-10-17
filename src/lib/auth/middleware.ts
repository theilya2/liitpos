import { createMiddleware } from "@tanstack/react-start";

/**
 * Admin-only middleware for back-office server functions.
 * The cookie is httpOnly and same-site. Callers do not send a user id.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next())
  .server(async ({ next }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    assertSameSiteRequest();
    const userId = await requireUserId();
    return next({ context: { userId } });
  });
