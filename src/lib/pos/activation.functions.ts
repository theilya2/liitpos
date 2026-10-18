import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { normalizeActivationCode } from "@/lib/pos/activation";
import { cleanBusinessId, cleanRegisterName } from "@/lib/pos/register";

export const listPendingActivations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { listPendingActivations: load } = await import("@/lib/pos/activation.server");
    return load();
  });

export const approveActivation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code?: unknown; businessId?: unknown; name?: unknown }) => {
    const code = typeof input?.code === "string" ? normalizeActivationCode(input.code) : null;
    if (!code) throw new Error("הקוד לא תקין.");
    const businessId = cleanBusinessId(input?.businessId);
    if (!businessId) throw new Error("צריך לבחור עסק.");
    return { code, businessId, name: cleanRegisterName(input?.name) };
  })
  .handler(async ({ data }) => {
    const { approveActivation: approve } = await import("@/lib/pos/activation.server");
    return approve(data);
  });

export const rejectActivation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code?: unknown }) => {
    const code = typeof input?.code === "string" ? normalizeActivationCode(input.code) : null;
    if (!code) throw new Error("הקוד לא תקין.");
    return { code };
  })
  .handler(async ({ data }) => {
    const { rejectActivation: reject } = await import("@/lib/pos/activation.server");
    await reject(data.code);
    return { ok: true as const };
  });
