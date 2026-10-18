import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isDocKind, type CloudDoc, type DocKind, type Json } from "@/lib/pos/docs";
import { normalizeKioskSettings } from "@/lib/pos/kiosk";
import { normalizePrintSettings } from "@/lib/pos/printer";
import { cloneSettings, codeForStore } from "@/lib/pos/seed";
import { cleanEndpoint } from "@/lib/pos/terminal";
import type { Settings, StaffUser } from "@/lib/pos/types";

export type PanelBusiness = {
  id: string;
  settings: Settings;
  updatedAt: string;
  sales: number;
  deleted: boolean;
};

export type PanelUser = StaffUser & { updatedAt: string; deleted: boolean };

export type PanelDevice = {
  id: string;
  locked: boolean;
  lastSeen: string;
  businessName: string;
  businessCode: string;
};

export type PanelData = {
  businesses: PanelBusiness[];
  users: PanelUser[];
  releasedAt: string | null;
  devices: PanelDevice[];
};

type DocRow = {
  id: string;
  kind: string;
  business_id: string;
  updated_at: string;
  deleted: boolean;
  doc: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function cleanDoc(input: unknown): CloudDoc | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length > 80) return null;
  if (typeof raw.kind !== "string" || !isDocKind(raw.kind)) return null;
  if (typeof raw.businessId !== "string" || raw.businessId.length > 40) return null;
  if (typeof raw.updatedAt !== "string" || Number.isNaN(Date.parse(raw.updatedAt))) return null;
  const encoded = JSON.stringify(raw.doc ?? {});
  if (encoded.length > 1_500_000) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    businessId: raw.businessId,
    updatedAt: new Date(raw.updatedAt).toISOString(),
    deleted: Boolean(raw.deleted),
    doc: (raw.doc ?? {}) as Json,
  };
}

function toCloud(row: DocRow): CloudDoc | null {
  if (!isDocKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind as DocKind,
    businessId: row.business_id,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    doc: asObject(row.doc) as Json,
  };
}

export const pullDocs = createServerFn({ method: "POST" })
  .validator((input: { since: string | null }) => {
    if (!input || (input.since !== null && typeof input.since !== "string")) throw new Error("בקשה לא תקינה");
    return { since: input.since };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { pullDocsForUser } = await import("./cloud.server");
    return pullDocsForUser(context.userId, data.since);
  });

export const pushDocs = createServerFn({ method: "POST" })
  .validator((input: { docs: unknown[] }) => {
    if (!input || !Array.isArray(input.docs) || input.docs.length > 20) throw new Error("בקשה לא תקינה");
    const docs = input.docs.map(cleanDoc).filter((doc): doc is CloudDoc => Boolean(doc));
    return { docs };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { pushDocsForUser } = await import("./cloud.server");
    return pushDocsForUser(context.userId, data.docs);
  });

function readSettings(doc: unknown): Settings | null {
  const raw = asObject(doc);
  if (typeof raw.businessName !== "string" || !raw.businessName.trim()) return null;
  const base = cloneSettings();
  const vat = Number(raw.vatRate);
  return {
    businessName: raw.businessName.trim().slice(0, 40),
    ownerName: typeof raw.ownerName === "string" ? raw.ownerName.slice(0, 40) : "",
    taxId: typeof raw.taxId === "string" ? raw.taxId.slice(0, 20) : "",
    address: typeof raw.address === "string" ? raw.address.slice(0, 80) : "",
    phone: typeof raw.phone === "string" ? raw.phone.slice(0, 20) : "",
    receiptFooter: typeof raw.receiptFooter === "string" ? raw.receiptFooter.slice(0, 80) : base.receiptFooter,
    vatRate: Number.isFinite(vat) ? Math.min(100, Math.max(0, vat)) : 18,
    openingFloat: Number.isFinite(Number(raw.openingFloat)) ? Math.max(0, Number(raw.openingFloat)) : 0,
    code: typeof raw.code === "string" && /^\d{6}$/.test(raw.code) ? raw.code : "",
    androidTerminal: cleanEndpoint(raw.androidTerminal, base.androidTerminal),
    pinpad: cleanEndpoint(raw.pinpad, base.pinpad),
    logo: typeof raw.logo === "string" && raw.logo.startsWith("data:image/") && raw.logo.length <= 150_000 ? raw.logo : null,
    ...normalizePrintSettings(raw),
    ...normalizeKioskSettings(raw),
  };
}

export const loadPanel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const settingsRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'settings'
      order by updated_at desc
    `;
    const staffRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'staff'
      order by updated_at desc
    `;
    const counts = await sql<{ business_id: string; sales: number }>`
      select business_id, count(*) as sales
      from pos_docs
      where user_id = ${context.userId} and kind = 'sale' and deleted = false
      group by business_id
    `;
    const salesByBusiness = new Map(counts.map((row) => [row.business_id, Number(row.sales) || 0]));
    const businesses: PanelBusiness[] = settingsRows.map((row) => {
      const settings = readSettings(row.doc) ?? { ...cloneSettings(), businessName: "עסק" };
      return {
        id: row.business_id,
        settings: { ...settings, code: settings.code || (row.business_id === "store-empty" ? "000000" : codeForStore(row.business_id)) },
        updatedAt: row.updated_at,
        sales: salesByBusiness.get(row.business_id) ?? 0,
        deleted: Boolean(row.deleted),
      };
    });
    const users: PanelUser[] = [];
    for (const row of staffRows) {
      const raw = asObject(row.doc);
      if (row.deleted || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
      const role = raw.role === "manager" || raw.role === "shift" || raw.role === "cashier" ? raw.role : "cashier";
      users.push({
        id: raw.id,
        name: raw.name,
        pin: typeof raw.pin === "string" ? raw.pin : "",
        role,
        active: raw.active !== false,
        storeIds: Array.isArray(raw.storeIds) ? raw.storeIds.filter((id): id is string => typeof id === "string") : [],
        updatedAt: row.updated_at,
        deleted: false,
      });
    }
    const releaseRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'release' and deleted = false
      order by updated_at desc
      limit 1
    `;
    const deviceRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'device' and deleted = false
      order by updated_at desc
      limit 20
    `;
    const releaseDoc = releaseRows[0] ? asObject(releaseRows[0].doc) : null;
    const releasedAt = releaseDoc && typeof releaseDoc.releasedAt === "string" ? releaseDoc.releasedAt : releaseRows[0]?.updated_at ?? null;
    const devices: PanelDevice[] = deviceRows.map((row) => {
      const raw = asObject(row.doc);
      return {
        id: typeof raw.deviceId === "string" ? raw.deviceId : row.id,
        locked: raw.locked === true,
        lastSeen: typeof raw.lastSeen === "string" ? raw.lastSeen : row.updated_at,
        businessName: typeof raw.businessName === "string" ? raw.businessName : "",
        businessCode: typeof raw.businessCode === "string" ? raw.businessCode : "",
      };
    });
    return { businesses: businesses.filter((item) => !item.deleted), users, releasedAt, devices } satisfies PanelData;
  });

type BusinessInput = {
  id: string | null;
  businessName: string;
  ownerName: string;
  taxId: string;
  address: string;
  phone: string;
  vatRate: number;
  code: string;
  logo: string | null;
};

export const saveCloudBusiness = createServerFn({ method: "POST" })
  .validator((input: BusinessInput) => {
    if (!input || typeof input.businessName !== "string" || !input.businessName.trim()) throw new Error("צריך שם לעסק");
    const id = input.id && /^[A-Za-z0-9_-]{1,40}$/.test(input.id) ? input.id : "";
    const vat = Number(input.vatRate);
    return {
      id,
      businessName: input.businessName.trim().slice(0, 40),
      ownerName: typeof input.ownerName === "string" ? input.ownerName.trim().slice(0, 40) : "",
      taxId: typeof input.taxId === "string" ? input.taxId.trim().slice(0, 20) : "",
      address: typeof input.address === "string" ? input.address.trim().slice(0, 80) : "",
      phone: typeof input.phone === "string" ? input.phone.trim().slice(0, 20) : "",
      vatRate: Number.isFinite(vat) ? Math.min(100, Math.max(0, vat)) : 18,
      code: typeof input.code === "string" && /^\d{6}$/.test(input.code) ? input.code : "",
      logo: typeof input.logo === "string" && input.logo.startsWith("data:image/") && input.logo.length <= 150_000 ? input.logo : null,
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const businessId = data.id || `store-${crypto.randomUUID().slice(0, 8)}`;
    const existing = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and id = ${`settings:${businessId}`}
      limit 1
    `;
    const previous = existing[0] ? readSettings(existing[0].doc) : null;
    const taken = await sql<{ business_id: string; doc: unknown }>`
      select business_id, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'settings' and deleted = false
    `;
    const used = new Set<string>();
    for (const row of taken) {
      if (row.business_id === businessId) continue;
      const settings = readSettings(row.doc);
      if (settings?.code) used.add(settings.code);
    }
    let code = data.code || previous?.code || "";
    if (!/^\d{6}$/.test(code)) {
      do {
        code = String(100000 + Math.floor(Math.random() * 900000));
      } while (used.has(code));
    } else if (used.has(code)) {
      throw new Error("המזהה הזה כבר שייך לעסק אחר");
    }
    const settings: Settings = {
      ...(previous ?? cloneSettings()),
      businessName: data.businessName,
      ownerName: data.ownerName,
      taxId: data.taxId,
      address: data.address,
      phone: data.phone,
      vatRate: data.vatRate,
      code,
      logo: data.logo,
      receiptFooter: previous?.receiptFooter || "תודה שקניתם אצלנו.",
    };
    const now = new Date().toISOString();
    await sql`
      insert into pos_docs (user_id, id, kind, business_id, updated_at, deleted, doc)
      values (${context.userId}, ${`settings:${businessId}`}, 'settings', ${businessId}, ${now}::timestamptz, false, ${JSON.stringify(settings)}::jsonb)
      on conflict (user_id, id) do update set
        updated_at = excluded.updated_at,
        deleted = false,
        doc = excluded.doc
    `;
    if (!existing[0]) {
      const catalog = { categories: [{ id: "general", name: "כללי" }], products: [], nextReceipt: 1001, nextZ: 1 };
      await sql`
        insert into pos_docs (user_id, id, kind, business_id, updated_at, deleted, doc)
        values (${context.userId}, ${`catalog:${businessId}`}, 'catalog', ${businessId}, ${now}::timestamptz, false, ${JSON.stringify(catalog)}::jsonb)
        on conflict (user_id, id) do nothing
      `;
    }
    return { id: businessId, code };
  });

export const deleteCloudBusiness = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error("עסק לא תקין");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: businessId }) => {
    const sql = await getSql();
    const now = new Date().toISOString();
    await sql`
      update pos_docs
      set deleted = true, updated_at = ${now}::timestamptz, doc = '{}'::jsonb
      where user_id = ${context.userId} and business_id = ${businessId} and kind in ('settings', 'catalog')
    `;
    const staffRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and kind = 'staff' and deleted = false
    `;
    for (const row of staffRows) {
      const raw = asObject(row.doc);
      if (typeof raw.id !== "string") continue;
      const storeIds = Array.isArray(raw.storeIds) ? raw.storeIds.filter((id): id is string => typeof id === "string") : [];
      if (raw.role === "manager" && storeIds.length === 0) continue;
      if (!storeIds.includes(businessId)) continue;
      const nextIds = storeIds.filter((id) => id !== businessId);
      if (!nextIds.length) {
        await sql`
          update pos_docs
          set deleted = true, updated_at = ${now}::timestamptz, doc = '{}'::jsonb
          where user_id = ${context.userId} and id = ${row.id}
        `;
      } else {
        const next = { ...raw, storeIds: nextIds };
        await sql`
          update pos_docs
          set updated_at = ${now}::timestamptz, doc = ${JSON.stringify(next)}::jsonb
          where user_id = ${context.userId} and id = ${row.id}
        `;
      }
    }
    return { id: businessId };
  });

export const saveCloudUser = createServerFn({ method: "POST" })
  .validator((input: StaffUser) => {
    if (!input || typeof input.name !== "string" || !input.name.trim()) throw new Error("צריך שם");
    if (typeof input.pin !== "string" || !/^\d{4}$/.test(input.pin)) throw new Error("הקוד צריך 4 ספרות");
    const role = input.role === "manager" || input.role === "shift" || input.role === "cashier" ? input.role : null;
    if (!role) throw new Error("תפקיד לא תקין");
    const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(input.id) ? input.id : "";
    const storeIds = Array.isArray(input.storeIds) ? input.storeIds.filter((item) => /^[A-Za-z0-9_-]{1,40}$/.test(item)).slice(0, 20) : [];
    return {
      id,
      name: input.name.trim().slice(0, 32),
      pin: input.pin,
      role,
      active: input.active !== false,
      storeIds: role === "manager" && storeIds.length === 0 ? [] : storeIds,
    } satisfies StaffUser;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const user: StaffUser = { ...data, id: data.id || `u_${crypto.randomUUID().slice(0, 8)}` };
    const now = new Date().toISOString();
    const businessId = user.storeIds[0] ?? "";
    await sql`
      insert into pos_docs (user_id, id, kind, business_id, updated_at, deleted, doc)
      values (${context.userId}, ${`staff:${user.id}`}, 'staff', ${businessId}, ${now}::timestamptz, false, ${JSON.stringify(user)}::jsonb)
      on conflict (user_id, id) do update set
        business_id = excluded.business_id,
        updated_at = excluded.updated_at,
        deleted = false,
        doc = excluded.doc
    `;
    return { id: user.id };
  });

export const deleteCloudUser = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error("משתמש לא תקין");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const now = new Date().toISOString();
    await sql`
      update pos_docs
      set deleted = true, updated_at = ${now}::timestamptz, doc = '{}'::jsonb
      where user_id = ${context.userId} and id = ${`staff:${id}`} and kind = 'staff'
    `;
    return { id };
  });

export const releaseCloudLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const now = new Date().toISOString();
    const doc = { releasedAt: now };
    await sql`
      insert into pos_docs (user_id, id, kind, business_id, updated_at, deleted, doc)
      values (${context.userId}, 'release:account', 'release', '', ${now}::timestamptz, false, ${JSON.stringify(doc)}::jsonb)
      on conflict (user_id, id) do update set
        updated_at = excluded.updated_at,
        deleted = false,
        doc = excluded.doc
    `;
    return { releasedAt: now };
  });

export type CloudProductRow = {
  id: string;
  name: string;
  price: number;
  sku: string;
  stock: number;
  trackStock: boolean;
  favorite: boolean;
  active: boolean;
};

export type CloudSaleRow = {
  id: string;
  number: number;
  createdAt: string;
  total: number;
  method: string;
  cashierName: string;
  voided: boolean;
  summary: string;
};

export type CloudMoveRow = {
  id: string;
  at: string;
  productName: string;
  qty: number;
  reason: string;
  by: string;
};

export type CloudZRow = {
  id: string;
  number: number;
  closedAt: string;
  turnover: number;
  salesCount: number;
  closedBy: string;
};

export type BusinessData = {
  products: CloudProductRow[];
  sales: CloudSaleRow[];
  moves: CloudMoveRow[];
  reports: CloudZRow[];
};

export const loadBusinessData = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error("עסק לא תקין");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: businessId }) => {
    const sql = await getSql();
    const catalogRows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId} and business_id = ${businessId} and kind = 'catalog' and deleted = false
      limit 1
    `;
    const rows = await sql<DocRow>`
      select id, kind, business_id, updated_at::text as updated_at, deleted, doc::text as doc
      from pos_docs
      where user_id = ${context.userId}
        and business_id = ${businessId}
        and deleted = false
        and kind in ('sale', 'move', 'z')
      order by updated_at desc
      limit 200
    `;
    const products: CloudProductRow[] = [];
    const sales: CloudSaleRow[] = [];
    const moves: CloudMoveRow[] = [];
    const reports: CloudZRow[] = [];
    const catalog = catalogRows[0] ? asObject(catalogRows[0].doc) : null;
    if (catalog && Array.isArray(catalog.products)) {
      for (const item of catalog.products) {
        const product = asObject(item);
        if (typeof product.name !== "string") continue;
        products.push({
          id: typeof product.id === "string" ? product.id : product.name,
          name: product.name,
          price: Number(product.price) || 0,
          sku: typeof product.sku === "string" ? product.sku : "",
          stock: Number(product.stock) || 0,
          trackStock: product.trackStock === true,
          favorite: product.favorite === true,
          active: product.active !== false,
        });
      }
    }
    for (const row of rows) {
      const doc = asObject(row.doc);
      if (row.kind === "sale" && sales.length < 80 && typeof doc.id === "string") {
        const lines = Array.isArray(doc.lines) ? doc.lines : [];
        const summary = lines
          .map((line) => {
            const item = asObject(line);
            const name = typeof item.name === "string" ? item.name : "";
            const qty = Number(item.qty) || 0;
            return name ? `${name}×${qty}` : "";
          })
          .filter(Boolean)
          .slice(0, 4)
          .join(" · ");
        sales.push({
          id: doc.id,
          number: Number(doc.number) || 0,
          createdAt: typeof doc.createdAt === "string" ? doc.createdAt : row.updated_at,
          total: Number(doc.total) || 0,
          method: typeof doc.method === "string" ? doc.method : "",
          cashierName: typeof doc.cashierName === "string" ? doc.cashierName : "",
          voided: doc.voided === true,
          summary,
        });
      } else if (row.kind === "move" && moves.length < 60 && typeof doc.id === "string") {
        moves.push({
          id: doc.id,
          at: typeof doc.at === "string" ? doc.at : row.updated_at,
          productName: typeof doc.productName === "string" ? doc.productName : "",
          qty: Number(doc.qty) || 0,
          reason: typeof doc.reason === "string" ? doc.reason : "",
          by: typeof doc.by === "string" ? doc.by : "",
        });
      } else if (row.kind === "z" && reports.length < 30 && typeof doc.id === "string") {
        reports.push({
          id: doc.id,
          number: Number(doc.number) || 0,
          closedAt: typeof doc.closedAt === "string" ? doc.closedAt : row.updated_at,
          turnover: Number(doc.turnover) || 0,
          salesCount: Number(doc.salesCount) || 0,
          closedBy: typeof doc.closedBy === "string" ? doc.closedBy : "",
        });
      }
    }
    return { products, sales, moves, reports } satisfies BusinessData;
  });
