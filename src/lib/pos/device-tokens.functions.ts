import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanDeviceLabel, type DeviceTokenView } from "@/lib/auth/pairing";

export type { DeviceTokenView };

export const listDeviceTokens = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listDeviceTokens: load } = await import("@/lib/auth/admin.server");
    return load();
  });

export const createDeviceToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { label?: unknown }) => {
    const label = cleanDeviceLabel(input?.label);
    if (!label) throw new Error("צריך שם למכשיר, עד 40 תווים.");
    return { label };
  })
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createDeviceToken: create } = await import("@/lib/auth/admin.server");
    const request = getRequest();
    if (!request) throw new Error("Unauthorized");
    return create(request, data.label);
  });

export const revokeDeviceToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: unknown }) => {
    if (!input || typeof input.id !== "string" || !/^dev_[0-9a-f]{16}$/.test(input.id)) throw new Error("מכשיר לא נמצא.");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const { revokeDeviceToken: revoke } = await import("@/lib/auth/admin.server");
    await revoke(data.id);
    return { ok: true as const };
  });
