import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanRegisterName } from "@/lib/pos/register";

const REGISTER_ID = /^reg_[0-9a-f]{16}$/;
const LEGACY_ID = /^dev_[0-9a-f]{16}$/;

export type RegisterView = {
  id: string;
  businessId: string;
  number: number;
  name: string;
  revoked: boolean;
  paired: boolean;
  appVersion: string;
  lastSync: string | null;
  lastContact: string | null;
  pendingOutbox: number;
  online: boolean;
};

export const listRegisters = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listRegisters: load } = await import("@/lib/auth/admin.server");
    return load();
  });

export const renameRegister = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: unknown; name?: unknown }) => {
    if (!input || typeof input.id !== "string" || !REGISTER_ID.test(input.id)) throw new Error("הקופה לא נמצאה.");
    return { id: input.id, name: cleanRegisterName(input?.name) };
  })
  .handler(async ({ data }) => {
    const { renameRegister: rename } = await import("@/lib/auth/admin.server");
    await rename(data.id, data.name);
    return { ok: true as const };
  });

export const revokeRegister = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: unknown }) => {
    if (!input || typeof input.id !== "string" || !REGISTER_ID.test(input.id)) throw new Error("הקופה לא נמצאה.");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const { revokeRegister: revoke } = await import("@/lib/auth/admin.server");
    await revoke(data.id);
    return { ok: true as const };
  });

export const revokeLegacyToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: unknown }) => {
    if (!input || typeof input.id !== "string" || !LEGACY_ID.test(input.id)) throw new Error("מכשיר לא נמצא.");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    const { revokeDeviceToken } = await import("@/lib/auth/admin.server");
    await revokeDeviceToken(data.id);
    return { ok: true as const };
  });

export const listLegacyTokens = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listLegacyTokens: load } = await import("@/lib/auth/admin.server");
    return load();
  });
