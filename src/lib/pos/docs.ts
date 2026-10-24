import { usableImage } from "@/lib/pos/image";
import { mergeRemoteCatalog } from "@/lib/pos/merge";
import { cleanTopShelf } from "@/lib/pos/shelves";
import { cleanGroups, cleanVariants } from "@/lib/pos/options";
import { cloneSettings, codeForStore, demoExtras, demoKiosk, demoPhoto, demoShelf, emptyBranch } from "@/lib/pos/seed";
import { normalizeKioskSettings } from "@/lib/pos/kiosk";
import { normalizePrintSettings } from "@/lib/pos/printer";
import { cleanPromos } from "@/lib/pos/promo";
import { saleCloudId } from "@/lib/pos/receipt-link";
import { cleanEndpoint } from "@/lib/pos/terminal";
import type { Branch, CashMove, ClubMember, DrawerOpen, Extra, Product, Sale, Settings, StaffUser, StockMove, ZReport } from "@/lib/pos/types";

export const DOC_KINDS = ["settings", "catalog", "staff", "sale", "move", "z", "drawer", "cash", "release", "device"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type CloudDoc = {
  id: string;
  kind: DocKind;
  businessId: string;
  updatedAt: string;
  deleted: boolean;
  doc: Json;
};

const KIND_RANK: Record<DocKind, number> = {
  settings: 0,
  catalog: 1,
  staff: 2,
  sale: 3,
  move: 4,
  z: 5,
  drawer: 6,
  cash: 7,
  release: 8,
  device: 9,
};

export function isDocKind(value: string): value is DocKind {
  return (DOC_KINDS as readonly string[]).includes(value);
}

export function mergeOutbox(outbox: CloudDoc[], extra: CloudDoc[]): CloudDoc[] {
  if (!extra.length) return outbox;
  const map = new Map(outbox.map((doc) => [doc.id, doc]));
  for (const doc of extra) map.set(doc.id, doc);
  return [...map.values()].slice(-800);
}

export function settingsDoc(businessId: string, settings: Settings, updatedAt: string, deleted = false): CloudDoc {
  return { id: `settings:${businessId}`, kind: "settings", businessId, updatedAt, deleted, doc: deleted ? {} : (settings as unknown as Json) };
}

export function catalogDoc(
  branch: Pick<Branch, "id" | "categories" | "products" | "nextReceipt" | "nextZ" | "nextCredit" | "members"> & { suppliers?: Branch["suppliers"] },
  updatedAt: string,
): CloudDoc {
  return {
    id: `catalog:${branch.id}`,
    kind: "catalog",
    businessId: branch.id,
    updatedAt,
    deleted: false,
    doc: {
      categories: branch.categories,
      products: branch.products,
      members: branch.members ?? [],
      suppliers: branch.suppliers ?? [],
      nextReceipt: branch.nextReceipt,
      nextZ: branch.nextZ,
      nextCredit: branch.nextCredit ?? 1,
    } as unknown as Json,
  };
}

export function staffDoc(user: StaffUser, updatedAt: string, deleted = false): CloudDoc {
  const businessId = user.storeIds[0] ?? "";
  return { id: `staff:${user.id}`, kind: "staff", businessId, updatedAt, deleted, doc: deleted ? {} : (user as unknown as Json) };
}

export function deviceDoc(deviceId: string, businessId: string, doc: Json, updatedAt: string): CloudDoc {
  return { id: `device:${deviceId}`, kind: "device", businessId, updatedAt, deleted: false, doc };
}

function saleDoc(businessId: string, sale: Sale, updatedAt: string): CloudDoc {
  return { id: saleCloudId(businessId, sale.id), kind: "sale", businessId, updatedAt, deleted: false, doc: sale as unknown as Json };
}

function moveDoc(businessId: string, move: StockMove, updatedAt: string): CloudDoc {
  return { id: `move:${businessId}:${move.id}`, kind: "move", businessId, updatedAt, deleted: false, doc: move as unknown as Json };
}

function zDoc(businessId: string, report: ZReport, updatedAt: string): CloudDoc {
  return { id: `z:${businessId}:${report.id}`, kind: "z", businessId, updatedAt, deleted: false, doc: report as unknown as Json };
}

function drawerDoc(businessId: string, event: DrawerOpen, updatedAt: string): CloudDoc {
  return { id: `drawer:${businessId}:${event.id}`, kind: "drawer", businessId, updatedAt, deleted: false, doc: event as unknown as Json };
}

function cashDoc(businessId: string, move: CashMove, updatedAt: string): CloudDoc {
  return { id: `cash:${businessId}:${move.id}`, kind: "cash", businessId, updatedAt, deleted: false, doc: move as unknown as Json };
}

export function snapshotDocs(stores: Branch[], staff: StaffUser[], updatedAt: string): CloudDoc[] {
  const docs: CloudDoc[] = [];
  for (const branch of stores) {
    if (!branch.id || branch.id === "store-empty") continue;
    docs.push(settingsDoc(branch.id, branch.settings, updatedAt));
    docs.push(catalogDoc(branch, updatedAt));
    for (const sale of branch.sales) docs.push(saleDoc(branch.id, sale, sale.createdAt || updatedAt));
    for (const move of branch.stockMoves) docs.push(moveDoc(branch.id, move, move.at || updatedAt));
    for (const report of branch.zReports) docs.push(zDoc(branch.id, report, report.closedAt || updatedAt));
    for (const event of branch.drawerOpens) docs.push(drawerDoc(branch.id, event, event.at || updatedAt));
    for (const move of branch.cashMoves ?? []) docs.push(cashDoc(branch.id, move, move.at || updatedAt));
  }
  for (const user of staff) docs.push(staffDoc(user, updatedAt));
  return docs;
}

function saleSyncMark(sale: Sale): string {
  return `${sale.voided}:${sale.zId ?? ""}:${sale.kioskStatus ?? ""}:${sale.publicToken ?? ""}`;
}

export function changesToDocs(
  before: { sales: Sale[]; stockMoves: StockMove[]; zReports: ZReport[]; drawerOpens: DrawerOpen[]; cashMoves?: CashMove[] },
  after: Branch,
  partial: Partial<Branch>,
): CloudDoc[] {
  const now = new Date().toISOString();
  const docs: CloudDoc[] = [];
  if (partial.settings) docs.push(settingsDoc(after.id, after.settings, now));
  if (
    partial.products ||
    partial.categories ||
    partial.members ||
    partial.suppliers ||
    partial.nextReceipt !== undefined ||
    partial.nextZ !== undefined ||
    partial.nextCredit !== undefined
  ) {
    docs.push(catalogDoc(after, now));
  }
  if (partial.sales) {
    const prev = new Map(before.sales.map((sale) => [sale.id, saleSyncMark(sale)]));
    for (const sale of after.sales) {
      const mark = saleSyncMark(sale);
      if (prev.get(sale.id) !== mark) docs.push(saleDoc(after.id, sale, now));
    }
  }
  if (partial.stockMoves) {
    const prev = new Set(before.stockMoves.map((move) => move.id));
    for (const move of after.stockMoves) {
      if (!prev.has(move.id)) docs.push(moveDoc(after.id, move, now));
    }
  }
  if (partial.zReports) {
    const prev = new Set(before.zReports.map((report) => report.id));
    for (const report of after.zReports) {
      if (!prev.has(report.id)) docs.push(zDoc(after.id, report, now));
    }
  }
  if (partial.drawerOpens) {
    const prev = new Set(before.drawerOpens.map((event) => event.id));
    for (const event of after.drawerOpens) {
      if (!prev.has(event.id)) docs.push(drawerDoc(after.id, event, now));
    }
  }
  if (partial.cashMoves) {
    const prev = new Map((before.cashMoves ?? []).map((move) => [move.id, move.zId ?? ""]));
    for (const move of after.cashMoves ?? []) {
      if (prev.get(move.id) !== (move.zId ?? "")) docs.push(cashDoc(after.id, move, now));
    }
  }
  return docs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asSettings(doc: unknown): Settings | null {
  if (!isRecord(doc) || typeof doc.businessName !== "string") return null;
  const base = cloneSettings();
  const vat = Number(doc.vatRate);
  const opening = Number(doc.openingFloat);
  return {
    businessName: String(doc.businessName).slice(0, 40) || base.businessName,
    ownerName: typeof doc.ownerName === "string" ? doc.ownerName.slice(0, 40) : "",
    taxId: typeof doc.taxId === "string" ? doc.taxId.slice(0, 20) : "",
    address: typeof doc.address === "string" ? doc.address.slice(0, 80) : "",
    phone: typeof doc.phone === "string" ? doc.phone.slice(0, 20) : "",
    receiptFooter: typeof doc.receiptFooter === "string" ? doc.receiptFooter.slice(0, 80) : base.receiptFooter,
    vatRate: Number.isFinite(vat) ? Math.min(100, Math.max(0, vat)) : base.vatRate,
    openingFloat: Number.isFinite(opening) ? Math.max(0, opening) : 0,
    code: typeof doc.code === "string" && /^\d{6}$/.test(doc.code) ? doc.code : "",
    androidTerminal: cleanEndpoint(doc.androidTerminal, base.androidTerminal),
    pinpad: cleanEndpoint(doc.pinpad, base.pinpad),
    logo: asLogo(doc.logo),
    ...normalizePrintSettings(doc),
    ...normalizeKioskSettings(doc),
    ...(Array.isArray(doc.promos) ? { promos: cleanPromos(doc.promos) } : {}),
    ...(Array.isArray(doc.topShelf) ? { topShelf: cleanTopShelf(doc.topShelf) } : {}),
  };
}

function asLogo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/") || value.length > 150_000) return null;
  return value;
}

function asExtras(value: unknown): Extra[] {
  if (!Array.isArray(value)) return [];
  const extras: Extra[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const price = Number(item.price);
    const name = item.name.trim().slice(0, 24);
    if (!name || !Number.isFinite(price) || price < 0) continue;
    extras.push({
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 40) : `x_${extras.length}`,
      name,
      price: Math.round(price * 100) / 100,
    });
    if (extras.length >= 8) break;
  }
  return extras;
}

function asMember(value: unknown): ClubMember | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const firstName = typeof value.firstName === "string" ? value.firstName.trim().slice(0, 24) : "";
  const lastName = typeof value.lastName === "string" ? value.lastName.trim().slice(0, 24) : "";
  const phone = typeof value.phone === "string" ? value.phone.trim().slice(0, 20) : "";
  if (!firstName && !lastName && !phone) return null;
  return {
    id: value.id.slice(0, 40),
    firstName,
    lastName,
    phone,
    note: typeof value.note === "string" ? value.note.slice(0, 80) : "",
    active: value.active !== false,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function asProduct(value: unknown): Product | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const price = Number(value.price);
  if (!Number.isFinite(price)) return null;
  return {
    id: value.id,
    name: value.name.slice(0, 40),
    price,
    categoryId: typeof value.categoryId === "string" ? value.categoryId : "hot",
    sku: typeof value.sku === "string" ? value.sku.slice(0, 20) : "",
    favorite: Boolean(value.favorite),
    active: value.active !== false,
    image: usableImage(typeof value.image === "string" ? value.image : null) ?? demoPhoto(value.id),
    trackStock: Boolean(value.trackStock),
    stock: Number.isFinite(Number(value.stock)) ? Number(value.stock) : 0,
    lowStock: Number.isFinite(Number(value.lowStock)) ? Number(value.lowStock) : 5,
    shelf: value.shelf === "upper" || value.shelf === "lower" || value.shelf === "off" ? value.shelf : (demoShelf(value.id) ?? "off"),
    kiosk: typeof value.kiosk === "boolean" ? value.kiosk : demoKiosk(value.id),
    extras: Array.isArray(value.extras) ? asExtras(value.extras) : demoExtras(value.id),
    barcode: typeof value.barcode === "string" ? value.barcode.slice(0, 32) : "",
    cost: Number.isFinite(Number(value.cost)) && Number(value.cost) >= 0 ? Math.round(Number(value.cost) * 100) / 100 : 0,
    supplierId: typeof value.supplierId === "string" ? value.supplierId.slice(0, 40) : "",
    variants: cleanVariants(value.variants),
    modifierGroups: cleanGroups(value.modifierGroups),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function asSale(doc: unknown): Sale | null {
  if (!isRecord(doc) || typeof doc.id !== "string" || !Array.isArray(doc.lines)) return null;
  return doc as Sale;
}

function asStaff(doc: unknown): StaffUser | null {
  if (!isRecord(doc) || typeof doc.id !== "string" || typeof doc.name !== "string") return null;
  const role = doc.role === "shift" || doc.role === "manager" || doc.role === "cashier" ? doc.role : null;
  if (!role || typeof doc.pin !== "string") return null;
  return {
    id: doc.id,
    name: doc.name.slice(0, 32),
    pin: doc.pin,
    role,
    active: doc.active !== false,
    storeIds: Array.isArray(doc.storeIds) ? doc.storeIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function upsertBranch(stores: Branch[], businessId: string): Branch[] {
  if (stores.some((branch) => branch.id === businessId)) return stores;
  // A business that arrives from the cloud starts empty. Demo categories belong
  // to the seeded shop, not to a Back Office business that has no catalog yet.
  const blank = emptyBranch(businessId, cloneSettings(), []);
  return [...stores.filter((branch) => branch.id !== "store-empty"), { ...blank, categories: [] }];
}

export function applyDocs(input: {
  stores: Branch[];
  staff: StaffUser[];
  activeStoreId: string;
  outbox: CloudDoc[];
  docs: CloudDoc[];
}): { stores: Branch[]; staff: StaffUser[]; activeStoreId: string } {
  const pending = new Set(input.outbox.map((doc) => doc.id));
  let stores = input.stores;
  let staff = input.staff;
  const docs = [...input.docs].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.updatedAt.localeCompare(b.updatedAt));

  for (const doc of docs) {
    if (pending.has(doc.id)) continue;
    if (doc.kind === "release" || doc.kind === "device") continue;
    if (!doc.businessId && doc.kind !== "staff") continue;
    if (doc.kind === "settings") {
      if (doc.deleted) {
        stores = stores.filter((branch) => branch.id !== doc.businessId);
        continue;
      }
      const settings = asSettings(doc.doc);
      if (!settings) continue;
      const code = settings.code || codeForStore(doc.businessId);
      stores = upsertBranch(stores, doc.businessId).map((branch) =>
        branch.id === doc.businessId ? { ...branch, settings: { ...settings, code } } : branch,
      );
      continue;
    }
    if (doc.kind === "catalog") {
      if (doc.deleted) continue;
      if (!isRecord(doc.doc)) continue;
      stores = upsertBranch(stores, doc.businessId).map((branch) => {
        if (branch.id !== doc.businessId) return branch;
        const pendingMoves = input.outbox
          .filter((item) => item.kind === "move" && item.businessId === doc.businessId)
          .map((item) => {
            if (!isRecord(item.doc) || typeof item.doc.productId !== "string") return null;
            const qty = Number(item.doc.qty);
            if (!Number.isFinite(qty)) return null;
            return { productId: item.doc.productId, qty };
          })
          .filter((item): item is { productId: string; qty: number } => Boolean(item));
        return { ...branch, ...mergeRemoteCatalog(branch, doc, pendingMoves) };
      });
      continue;
    }
    if (doc.kind === "staff") {
      if (doc.deleted) {
        const id = doc.id.replace(/^staff:/, "");
        staff = staff.filter((user) => user.id !== id);
        continue;
      }
      const user = asStaff(doc.doc);
      if (!user) continue;
      staff = staff.some((item) => item.id === user.id) ? staff.map((item) => (item.id === user.id ? user : item)) : [...staff, user];
      continue;
    }
    const branch = stores.find((item) => item.id === doc.businessId);
    if (!branch || doc.deleted) continue;
    if (doc.kind === "sale") {
      const sale = asSale(doc.doc);
      if (!sale) continue;
      const sales = branch.sales.some((item) => item.id === sale.id)
        ? branch.sales.map((item) => (item.id === sale.id ? sale : item))
        : [sale, ...branch.sales];
      stores = stores.map((item) => (item.id === branch.id ? { ...item, sales } : item));
      continue;
    }
    if (doc.kind === "move" && isRecord(doc.doc) && typeof doc.doc.id === "string") {
      const move = doc.doc as StockMove;
      if (branch.stockMoves.some((item) => item.id === move.id)) continue;
      stores = stores.map((item) => (item.id === branch.id ? { ...item, stockMoves: [move, ...item.stockMoves].slice(0, 400) } : item));
      continue;
    }
    if (doc.kind === "z" && isRecord(doc.doc) && typeof doc.doc.id === "string") {
      const report = doc.doc as ZReport;
      if (branch.zReports.some((item) => item.id === report.id)) continue;
      stores = stores.map((item) => (item.id === branch.id ? { ...item, zReports: [report, ...item.zReports] } : item));
      continue;
    }
    if (doc.kind === "drawer" && isRecord(doc.doc) && typeof doc.doc.id === "string") {
      const event = doc.doc as DrawerOpen;
      if (branch.drawerOpens.some((item) => item.id === event.id)) continue;
      stores = stores.map((item) => (item.id === branch.id ? { ...item, drawerOpens: [event, ...item.drawerOpens].slice(0, 200) } : item));
      continue;
    }
    if (doc.kind === "cash" && isRecord(doc.doc) && typeof doc.doc.id === "string") {
      const move = doc.doc as CashMove;
      const current = branch.cashMoves ?? [];
      const next = current.some((item) => item.id === move.id) ? current.map((item) => (item.id === move.id ? move : item)) : [move, ...current].slice(0, 200);
      stores = stores.map((item) => (item.id === branch.id ? { ...item, cashMoves: next } : item));
    }
  }

  if (!stores.length) {
    stores = [emptyBranch("store-empty", { ...cloneSettings(), businessName: "אין עסק פעיל", openingFloat: 0, code: "000000" }, [])];
  }
  const activeStoreId = stores.some((branch) => branch.id === input.activeStoreId) ? input.activeStoreId : stores[0].id;
  return { stores, staff, activeStoreId };
}
