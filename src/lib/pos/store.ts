import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { can, canSeeStore } from "@/lib/pos/access";
import { cleanCredits, issueCreditsForTenders, newCreditCode, redeemCredits } from "@/lib/pos/credits";
import { cleanCustomerSlides } from "@/lib/pos/customer-screen";
import { drawerExpected, drawerVariance, paidIn, paidOut } from "@/lib/pos/cash";
import { outboxWithoutDropped, pruneDemoSeed } from "@/lib/pos/baseline";
import { applyDocs, catalogDoc, changesToDocs, deviceDoc, mergeOutbox, settingsDoc, snapshotDocs, staffDoc, type CloudDoc } from "@/lib/pos/docs";
import { normalizeKioskSettings } from "@/lib/pos/kiosk";
import { roundMoney } from "@/lib/pos/money";
import { activeVariants, changeStock, cleanGroups, cleanVariants, demandOf, groupsFor, hasEnough, splitStockKey, stockOnHand } from "@/lib/pos/options";
import { usableImage } from "@/lib/pos/image";
import { cleanPromos, priceCart } from "@/lib/pos/promo";
import { cleanTopShelf } from "@/lib/pos/shelves";
import { cleanSuppliers } from "@/lib/pos/suppliers";
import { isCredit, quoteRefund, refundMethodsFor, settleSale, tendersOf, zFigures, type RefundPick, type TenderInput } from "@/lib/pos/tender";
import {
  buildDemoSales,
  cloneCategories,
  cloneProducts,
  cloneSettings,
  codeForStore,
  defaultStaff,
  demoExtras,
  demoKiosk,
  demoMembers,
  demoPhoto,
  demoShelf,
  DEMO_SALE_COUNT,
  emptyBranch,
  kioskBranch,
  mainBranch,
} from "@/lib/pos/seed";
import { type Branch, type CartLine, type CashMove, type Category, type ClubMember, type Discount, type DrawerOpen, type HeldOrder, type PaymentMethod, type Product, type PunchKind, type Role, type Sale, type Settings, type StaffUser, type StockMove, type StockReason, type TerminalKind, type ZReport } from "@/lib/pos/types";
import { canUseBusiness, isDemoMode } from "@/lib/pos/demo";
import { readDeviceId } from "@/lib/pos/native";
import { registerStamp, type RegisterClaim } from "@/lib/pos/register";
import { withPrintSettings } from "@/lib/pos/printer";
import { isReceiptToken, newReceiptToken } from "@/lib/pos/receipt-link";
import { applyPunchEdit, cleanPunches, clockByPin, manualPunch, voidPunchRecord } from "@/lib/pos/timeclock";
import { cleanEndpoint } from "@/lib/pos/terminal";

type BranchFields = Omit<Branch, "id">;

type PosState = BranchFields & {
  seeded: boolean;
  activeStoreId: string;
  stores: Branch[];
  staff: StaffUser[];
  sessionUserId: string | null;
  outbox: CloudDoc[];
  cloudCursor: string | null;
  lastGoodSync: string | null;
  appliedReleaseAt: string | null;
  deviceId: string;
  registerNo: number | null;
  registerName: string;
  registerBusinessId: string;
  registerRevoked: boolean;
  gateStoreId: string | null;
  receiptToPrint: Sale | null;
  zToPrint: ZReport | null;
  addProductToCart: (product: Product) => boolean;
  addCartLine: (line: CartLine) => boolean;
  addCustomItem: (name: string, price: number) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  restoreLine: (line: CartLine, index: number) => void;
  clearCart: () => void;
  setDiscount: (discount: Discount) => void;
  holdCart: () => boolean;
  resumeHeld: (id: string) => void;
  discardHeld: (id: string) => void;
  clockPunch: (pin: string, kind: PunchKind) => { ok: boolean; message: string };
  correctPunch: (id: string, atIso: string, why: string) => { ok: boolean; message: string };
  addPunch: (staffId: string, kind: PunchKind, atIso: string, why: string) => { ok: boolean; message: string };
  voidPunch: (id: string, why: string) => { ok: boolean; message: string };
  checkout: (input: {
    method?: PaymentMethod;
    tendered?: number;
    payments?: number;
    tenders?: TenderInput[];
    terminal?: TerminalKind | null;
    authCode?: string;
    cardLast4?: string;
    cardBrand?: string;
    lines?: CartLine[];
    channel?: "register" | "kiosk";
  }) => Sale | null;
  voidSale: (id: string) => void;
  refundSale: (input: { saleId: string; lines: RefundPick[]; tenders: TenderInput[] }) => Sale | null;
  markKiosk: (id: string, status: "new" | "done") => void;
  upsertProduct: (product: Product) => void;
  addCategory: (name: string) => string | null;
  addSupplier: (name: string) => string | null;
  updateSettings: (patch: Partial<Settings>) => void;
  saveMember: (member: ClubMember) => void;
  rememberBusinessSettings: (businessId: string, patch: Partial<Settings>) => void;
  adjustStock: (productId: string, qty: number, reason: StockReason, note: string, variantId?: string | null) => void;
  openDrawer: () => void;
  recordCash: (direction: "in" | "out", amount: number, reason: string) => boolean;
  closeZ: (cashCounted: number, leftInDrawer: number) => ZReport | null;
  clearHistory: () => void;
  resetDemo: () => void;
  queuePrint: (sale: Sale) => void;
  attachReceiptToken: (saleId: string) => string;
  queueZPrint: (report: ZReport) => void;
  login: (userId: string, pin: string) => boolean;
  lock: () => void;
  switchStore: (id: string) => void;
  setGateStore: (id: string | null) => void;
  addStore: (settings: Omit<Settings, "androidTerminal" | "pinpad" | "logo" | "autoPrint" | "paperWidth" | "printerName" | "openDrawer">) => string;
  saveStaff: (user: StaffUser) => string | null;
  applyRemote: (docs: CloudDoc[]) => void;
  /** Drop the local demo shop after the cloud baseline for a paired register. */
  takePairedBaseline: (docs: CloudDoc[], businessId: string) => boolean;
  replaceOutbox: (docs: CloudDoc[]) => void;
  ackOutbox: (ids: string[]) => void;
  setCloudCursor: (cursor: string | null) => void;
  acceptCloudClock: (serverTime: string, releaseAt: string | null) => void;
  adoptRegister: (claim: RegisterClaim) => void;
  markRegisterRevoked: () => void;
};

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isWeekLocked(lastGoodSync: string | null, appliedReleaseAt: string | null, now = Date.now()): boolean {
  if (!lastGoodSync) return false;
  const start = Date.parse(lastGoodSync);
  if (!Number.isFinite(start)) return false;
  if (now - start <= WEEK_MS) return false;
  if (appliedReleaseAt) {
    const released = Date.parse(appliedReleaseAt);
    if (Number.isFinite(released) && released > start) return false;
  }
  return true;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function memoryStorage(): Storage {
  const bag = new Map<string, string>();
  return {
    get length() {
      return bag.size;
    },
    clear: () => bag.clear(),
    getItem: (key) => bag.get(key) ?? null,
    key: (index) => [...bag.keys()][index] ?? null,
    removeItem: (key) => {
      bag.delete(key);
    },
    setItem: (key, value) => {
      bag.set(key, value);
    },
  };
}

function toBranch(state: BranchFields & { activeStoreId: string }): Branch {
  return {
    id: state.activeStoreId,
    categories: state.categories,
    products: state.products,
    cart: state.cart,
    discount: state.discount,
    held: state.held,
    sales: state.sales,
    nextReceipt: state.nextReceipt,
    nextCredit: state.nextCredit,
    settings: state.settings,
    zReports: state.zReports,
    nextZ: state.nextZ,
    stockMoves: state.stockMoves,
    drawerOpens: state.drawerOpens,
    cashMoves: state.cashMoves ?? [],
    members: state.members,
    suppliers: state.suppliers ?? [],
    punches: state.punches ?? [],
    credits: state.credits ?? [],
  };
}

function fromBranch(branch: Branch): BranchFields {
  return {
    categories: branch.categories,
    products: branch.products,
    cart: branch.cart,
    discount: branch.discount,
    held: branch.held,
    sales: branch.sales,
    nextReceipt: branch.nextReceipt,
    nextCredit: branch.nextCredit,
    settings: branch.settings,
    zReports: branch.zReports,
    nextZ: branch.nextZ,
    stockMoves: branch.stockMoves,
    drawerOpens: branch.drawerOpens,
    cashMoves: branch.cashMoves ?? [],
    members: branch.members,
    suppliers: branch.suppliers ?? [],
    punches: branch.punches ?? [],
    credits: branch.credits ?? [],
  };
}

function sameLine(left: CartLine, right: CartLine): boolean {
  if ((left.productId ?? null) !== (right.productId ?? null)) return false;
  if ((left.variantId ?? null) !== (right.variantId ?? null)) return false;
  if (left.unitPrice !== right.unitPrice) return false;
  const a = (left.modifiers ?? []).map((item) => item.optionId).sort().join(",");
  const b = (right.modifiers ?? []).map((item) => item.optionId).sort().join(",");
  return a === b;
}

function actorName(state: PosState): string {
  return state.staff.find((user) => user.id === state.sessionUserId)?.name ?? "";
}

function managerActor(state: PosState): { byId: string; byName: string } | null {
  const user = state.staff.find((item) => item.id === state.sessionUserId);
  if (!user || !can(user.role, "manage")) return null;
  return { byId: user.id, byName: user.name };
}

function promoLinesOf(sales: Sale[]): { name: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.voided || isCredit(sale)) continue;
    for (const hit of sale.promoHits ?? []) {
      if (!hit?.name || !(hit.amount > 0)) continue;
      totals.set(hit.name, roundMoney((totals.get(hit.name) ?? 0) + hit.amount));
    }
  }
  return [...totals].map(([name, amount]) => ({ name, amount }));
}

function normalizeProduct(product: Product): Product {
  const id = product.id;
  return {
    ...product,
    image: usableImage(product.image) || demoPhoto(id),
    cost: Number.isFinite(Number(product.cost)) && Number(product.cost) >= 0 ? roundMoney(Number(product.cost)) : 0,
    supplierId: typeof product.supplierId === "string" ? product.supplierId.slice(0, 40) : "",
    trackStock: product.trackStock ?? false,
    stock: Number.isFinite(product.stock) ? product.stock : 0,
    lowStock: Number.isFinite(product.lowStock) ? product.lowStock : 5,
    shelf: product.shelf === "upper" || product.shelf === "lower" || product.shelf === "off" ? product.shelf : (demoShelf(id) ?? "off"),
    kiosk: typeof product.kiosk === "boolean" ? product.kiosk : demoKiosk(id),
    extras: Array.isArray(product.extras) ? product.extras : demoExtras(id),
    barcode: typeof product.barcode === "string" ? product.barcode.slice(0, 32) : "",
    variants: cleanVariants(product.variants),
    modifierGroups: cleanGroups(product.modifierGroups),
  };
}

function normalizeBranch(branch: Branch): Branch {
  return {
    ...emptyBranch(branch.id, branch.settings ?? cloneSettings(), []),
    ...branch,
    products: (branch.products ?? []).map(normalizeProduct),
    nextCredit: branch.nextCredit ?? 1,
    sales: (branch.sales ?? []).map((sale) => ({
      ...sale,
      zId: sale.zId ?? null,
      cashierName: sale.cashierName ?? "",
      kind: sale.kind === "credit" ? "credit" : "sale",
      lines: sale.lines.map((line) => ({ ...line, productId: line.productId ?? null })),
      tenders: tendersOf(sale),
    })),
    zReports: branch.zReports ?? [],
    nextZ: branch.nextZ ?? 1,
    stockMoves: branch.stockMoves ?? [],
    drawerOpens: branch.drawerOpens ?? [],
    cashMoves: branch.cashMoves ?? [],
    cart: branch.cart ?? [],
    held: branch.held ?? [],
    categories: branch.categories ?? cloneCategories(),
    members: Array.isArray(branch.members) ? branch.members : branch.id === "store-main" ? demoMembers() : [],
    suppliers: cleanSuppliers(branch.suppliers),
    punches: cleanPunches(branch.punches),
    credits: cleanCredits(branch.credits),
  };
}

function applyDemoStock(products: Product[], sales: Sale[]): Product[] {
  const next = products.map((product) => ({ ...product }));
  for (const sale of sales) {
    if (sale.voided || isCredit(sale)) continue;
    for (const line of sale.lines) {
      const product = next.find((item) => item.name === line.name);
      if (!product?.trackStock) continue;
      product.stock = Math.max(0, product.stock - line.qty);
      line.productId = product.id;
    }
  }
  return next;
}

function freshStores(): Branch[] {
  return [mainBranch(), kioskBranch()];
}

function stampCode(branch: Branch, used: Set<string>): Branch {
  const settings = { ...cloneSettings(), ...branch.settings };
  let code = /^\d{6}$/.test(settings.code) ? settings.code : codeForStore(branch.id);
  if (branch.id === "store-empty") code = "000000";
  if (code !== "000000") {
    while (used.has(code)) {
      const next = 100000 + ((Number(code) + 1) % 900000);
      code = String(next);
    }
    used.add(code);
  }
  return {
    ...branch,
    settings: withPrintSettings({
      ...settings,
      code,
      ...(Array.isArray(settings.promos) ? { promos: cleanPromos(settings.promos) } : {}),
      ...(Array.isArray(settings.topShelf) ? { topShelf: cleanTopShelf(settings.topShelf) } : {}),
    }),
  };
}

function activate(state: PosState, id: string): Partial<PosState> | null {
  const stores = state.stores.map((branch) => (branch.id === state.activeStoreId ? toBranch(state) : branch));
  const next = stores.find((branch) => branch.id === id);
  if (!next || !canUseBusiness(next.id, next.settings.code)) return null;
  return { stores, activeStoreId: id, receiptToPrint: null, zToPrint: null, ...fromBranch(next) };
}

const initialStores = freshStores();
const initialBranch = fromBranch(initialStores[0]);

export const usePos = create<PosState>()(
  persist(
    (set, get) => {
      const commit = (partial: Partial<PosState>) => {
        const prev = get();
        const merged = { ...prev, ...partial };
        const stores = merged.stores.map((branch) => (branch.id === merged.activeStoreId ? toBranch(merged) : branch));
        const after = stores.find((branch) => branch.id === merged.activeStoreId);
        const extra = after ? changesToDocs(prev, after, partial) : [];
        set({ ...partial, stores, outbox: mergeOutbox(prev.outbox, extra) });
      };

      return {
        seeded: false,
        activeStoreId: initialStores[0].id,
        stores: initialStores,
        staff: defaultStaff(),
        sessionUserId: null,
        outbox: [],
        cloudCursor: null,
        lastGoodSync: null,
        appliedReleaseAt: null,
        deviceId: "",
        registerNo: null,
        registerName: "",
        registerBusinessId: "",
        registerRevoked: false,
        gateStoreId: null,
        receiptToPrint: null,
        zToPrint: null,
        ...initialBranch,

        addProductToCart: (product) => {
          if (!product.active) return false;
          if (activeVariants(product).length || groupsFor(product).some((group) => group.required || group.min > 0)) return false;
          const state = get();
          const existing = state.cart.find((line) => line.productId === product.id);
          const inCart = existing?.qty ?? 0;
          if (product.trackStock && product.stock - inCart <= 0) return false;
          if (existing) {
            commit({
              cart: state.cart.map((line) =>
                line.key === existing.key ? { ...line, qty: Math.min(999, line.qty + 1) } : line,
              ),
            });
            return true;
          }
          const line: CartLine = {
            key: newId(),
            productId: product.id,
            name: product.name,
            unitPrice: product.price,
            qty: 1,
          };
          commit({ cart: [...state.cart, line] });
          return true;
        },

        addCartLine: (line) => {
          if (!line.name.trim() || line.qty <= 0 || line.unitPrice < 0) return false;
          const state = get();
          const product = line.productId ? state.products.find((item) => item.id === line.productId) : undefined;
          if (line.productId && (!product || !product.active)) return false;
          const variantId = line.variantId ?? null;
          if (product?.trackStock) {
            const already = state.cart
              .filter((item) => item.productId === line.productId && (item.variantId ?? null) === variantId)
              .reduce((sum, item) => sum + item.qty, 0);
            if (!hasEnough(product, variantId, already + line.qty)) return false;
          }
          const existing = state.cart.find((item) => sameLine(item, line));
          if (existing) {
            commit({
              cart: state.cart.map((item) => (item.key === existing.key ? { ...item, qty: Math.min(999, item.qty + line.qty) } : item)),
            });
            return true;
          }
          commit({ cart: [...state.cart, { ...line, key: newId(), variantId, modifiers: line.modifiers ?? [], qty: Math.max(1, Math.round(line.qty)) }] });
          return true;
        },

        addCustomItem: (name, price) => {
          const clean = name.trim();
          const unitPrice = roundMoney(price);
          if (!clean || unitPrice <= 0) return;
          const line: CartLine = {
            key: newId(),
            productId: null,
            name: clean.slice(0, 40),
            unitPrice,
            qty: 1,
          };
          commit({ cart: [...get().cart, line] });
        },

        setQty: (key, qty) => {
          const state = get();
          const line = state.cart.find((item) => item.key === key);
          if (!line) return;
          const product = line.productId ? state.products.find((item) => item.id === line.productId) : undefined;
          const others = state.cart
            .filter((item) => item.key !== line.key && item.productId === line.productId && (item.variantId ?? null) === (line.variantId ?? null))
            .reduce((sum, item) => sum + item.qty, 0);
          const cap = product?.trackStock ? Math.max(0, stockOnHand(product, line.variantId) - others) : 999;
          const nextQty = Math.min(cap, Math.round(qty));
          commit({
            cart:
              nextQty <= 0
                ? state.cart.filter((item) => item.key !== key)
                : state.cart.map((item) => (item.key === key ? { ...item, qty: nextQty } : item)),
          });
        },

        removeLine: (key) => commit({ cart: get().cart.filter((line) => line.key !== key) }),

        restoreLine: (line, index) => {
          const cart = get().cart;
          if (cart.some((item) => item.key === line.key)) return;
          const at = Math.max(0, Math.min(index, cart.length));
          const next = cart.slice();
          next.splice(at, 0, line);
          commit({ cart: next });
        },

        clearCart: () => commit({ cart: [], discount: null }),

        setDiscount: (discount) => commit({ discount }),

        holdCart: () => {
          const state = get();
          if (!state.cart.length || state.held.length >= 5) return false;
          const held: HeldOrder = {
            id: newId(),
            createdAt: new Date().toISOString(),
            lines: state.cart,
            discount: state.discount,
          };
          commit({ held: [held, ...state.held].slice(0, 5), cart: [], discount: null });
          return true;
        },

        resumeHeld: (id) => {
          const state = get();
          const order = state.held.find((item) => item.id === id);
          if (!order) return;
          let held = state.held.filter((item) => item.id !== id);
          if (state.cart.length) {
            held = [
              { id: newId(), createdAt: new Date().toISOString(), lines: state.cart, discount: state.discount },
              ...held,
            ].slice(0, 5);
          }
          commit({ cart: order.lines, discount: order.discount, held });
        },

        discardHeld: (id) => commit({ held: get().held.filter((item) => item.id !== id) }),

        clockPunch: (pin, kind) => {
          const state = get();
          const stamp = registerStamp(state);
          const result = clockByPin({
            punches: state.punches ?? [],
            staff: state.staff,
            storeId: state.activeStoreId,
            pin,
            kind,
            at: new Date().toISOString(),
            registerNo: stamp?.registerNo ?? null,
            registerName: stamp?.registerName ?? "",
            id: newId,
          });
          if (result.ok) commit({ punches: result.punches });
          return { ok: result.ok, message: result.message };
        },

        correctPunch: (id, atIso, why) => {
          const state = get();
          const editor = managerActor(state);
          if (!editor) return { ok: false, message: "רק מנהל מתקן נוכחות" };
          const punch = (state.punches ?? []).find((item) => item.id === id);
          if (!punch) return { ok: false, message: "הרישום לא נמצא" };
          const next = applyPunchEdit(punch, { atIso, why, ...editor, editedAt: new Date().toISOString() });
          if (!next) return { ok: false, message: "צריך שעה תקינה וסיבה" };
          commit({ punches: (state.punches ?? []).map((item) => (item.id === id ? next : item)) });
          return { ok: true, message: "התיקון נשמר. השעה המקורית נשארת ביומן." };
        },

        addPunch: (staffId, kind, atIso, why) => {
          const state = get();
          const editor = managerActor(state);
          if (!editor) return { ok: false, message: "רק מנהל מתקן נוכחות" };
          const staff = state.staff.find((item) => item.id === staffId);
          if (!staff) return { ok: false, message: "העובד לא נמצא" };
          const stamp = registerStamp(state);
          const punch = manualPunch({
            staff,
            kind,
            atIso,
            why,
            ...editor,
            editedAt: new Date().toISOString(),
            registerNo: stamp?.registerNo ?? null,
            registerName: stamp?.registerName ?? "",
            storeId: state.activeStoreId,
            id: newId(),
          });
          if (!punch) return { ok: false, message: "צריך שעה תקינה וסיבה" };
          commit({ punches: [...(state.punches ?? []), punch] });
          return { ok: true, message: "הרישום החסר נוסף, עם שם המנהל והסיבה." };
        },

        voidPunch: (id, why) => {
          const state = get();
          const editor = managerActor(state);
          if (!editor) return { ok: false, message: "רק מנהל מתקן נוכחות" };
          const punch = (state.punches ?? []).find((item) => item.id === id);
          if (!punch) return { ok: false, message: "הרישום לא נמצא" };
          const next = voidPunchRecord(punch, { why, ...editor, editedAt: new Date().toISOString() });
          if (!next) return { ok: false, message: "צריך סיבה" };
          commit({ punches: (state.punches ?? []).map((item) => (item.id === id ? next : item)) });
          return { ok: true, message: "הרישום בוטל ונשאר ביומן." };
        },

        checkout: (input) => {
          const state = get();
          const channel = input.channel ?? "register";
          const lines = input.lines ?? state.cart;
          if (isWeekLocked(state.lastGoodSync, state.appliedReleaseAt)) return null;
          if (!lines.length) return null;
          const needed = demandOf(lines);
          for (const [key, qty] of needed) {
            const { productId, variantId } = splitStockKey(key);
            const product = state.products.find((item) => item.id === productId);
            if (!hasEnough(product, variantId, qty)) return null;
          }
          const discount = channel === "kiosk" ? null : state.discount;
          const totals = priceCart(lines, state.products, state.settings.promos, discount, state.settings.vatRate);
          if (totals.total <= 0) return null;
          const parts: TenderInput[] = input.tenders?.length
            ? input.tenders
            : input.method
              ? [
                  {
                    method: input.method,
                    tendered: input.method === "cash" ? roundMoney(input.tendered ?? 0) : totals.total,
                    payments: input.payments,
                    terminal: input.terminal,
                    authCode: input.authCode,
                    cardLast4: input.cardLast4,
                    cardBrand: input.cardBrand,
                  },
                ]
              : [];
          const settled = settleSale(totals.total, parts);
          if (!settled) return null;
          const number = state.nextReceipt;
          const by = channel === "kiosk" ? "קיוסק" : actorName(state);
          const card = settled.tenders.find((line) => line.method === "card" || line.method === "club");
          const sale: Sale = {
            id: newId(),
            number,
            createdAt: new Date().toISOString(),
            lines: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId ?? null,
              sku: line.sku ?? "",
              name: line.name,
              unitPrice: line.unitPrice,
              qty: line.qty,
              lineTotal: roundMoney(line.unitPrice * line.qty),
              modifiers: line.modifiers ?? [],
            })),
            discountAmount: totals.discountAmount,
            promoAmount: totals.promoAmount,
            promoLabel: totals.promoLabel,
            promoHits: totals.hits,
            total: totals.total,
            vatRate: state.settings.vatRate,
            vatAmount: totals.vat,
            net: totals.net,
            method: settled.method,
            tenders: settled.tenders,
            kind: "sale",
            amountDue: settled.amountDue,
            rounding: settled.rounding,
            tendered: settled.tendered,
            change: settled.change,
            voided: false,
            zId: null,
            cashierName: by,
            payments: settled.payments,
            terminal: card?.terminal ?? null,
            authCode: card?.authCode ?? "",
            cardLast4: card?.cardLast4 ?? "",
            cardBrand: card?.cardBrand ?? "",
            channel,
            kioskStatus: channel === "kiosk" ? "new" : null,
            ...(registerStamp(state) ?? {}),
            publicToken: newReceiptToken(),
            business: {
              businessName: state.settings.businessName,
              ownerName: state.settings.ownerName,
              taxId: state.settings.taxId,
              address: state.settings.address,
              phone: state.settings.phone,
              receiptFooter: state.settings.receiptFooter,
            },
          };
          const redeemed = redeemCredits(
            state.credits ?? [],
            settled.tenders,
            { at: sale.createdAt, saleId: sale.id, saleNumber: number, registerNo: sale.registerNo ?? null },
            Date.parse(sale.createdAt),
          );
          if (!redeemed.ok) return null;
          const moves: StockMove[] = [];
          const products = state.products.map((product) => {
            let next = product;
            for (const [key, qty] of needed) {
              const split = splitStockKey(key);
              if (split.productId !== product.id || !product.trackStock) continue;
              const changed = changeStock(next, split.variantId, -qty);
              moves.push({
                id: newId(),
                at: sale.createdAt,
                productId: product.id,
                variantId: split.variantId,
                productName: changed.name,
                qty: -qty,
                stockAfter: changed.stockAfter,
                reason: "sale",
                note: `קבלה ${number}`,
                by,
              });
              next = changed.product;
            }
            return next;
          });
          commit({
            sales: [sale, ...state.sales],
            nextReceipt: number + 1,
            products,
            stockMoves: [...moves, ...state.stockMoves].slice(0, 400),
            ...(input.lines ? {} : { cart: [], discount: null }),
            ...(redeemed.credits === (state.credits ?? []) ? {} : { credits: redeemed.credits }),
          });
          return sale;
        },

        voidSale: (id) => {
          const state = get();
          const sale = state.sales.find((item) => item.id === id);
          if (!sale || sale.voided || sale.zId || isCredit(sale)) return;
          if (state.sales.some((item) => item.kind === "credit" && !item.voided && item.creditOfId === id)) return;
          const by = actorName(state);
          const moves: StockMove[] = [];
          let products = state.products;
          for (const line of sale.lines) {
            if (!line.productId) continue;
            products = products.map((product) => {
              if (product.id !== line.productId || !product.trackStock) return product;
              const changed = changeStock(product, line.variantId, line.qty);
              moves.push({
                id: newId(),
                at: new Date().toISOString(),
                productId: product.id,
                variantId: line.variantId ?? null,
                productName: changed.name,
                qty: line.qty,
                stockAfter: changed.stockAfter,
                reason: "void",
                note: `ביטול קבלה ${sale.number}`,
                by,
              });
              return changed.product;
            });
          }
          commit({
            sales: state.sales.map((item) => (item.id === id ? { ...item, voided: true } : item)),
            products,
            stockMoves: [...moves, ...state.stockMoves].slice(0, 400),
          });
        },

        refundSale: (input) => {
          const state = get();
          const user = state.staff.find((item) => item.id === state.sessionUserId);
          if (!user || !can(user.role, "refund")) return null;
          if (isWeekLocked(state.lastGoodSync, state.appliedReleaseAt)) return null;
          const sale = state.sales.find((item) => item.id === input.saleId);
          if (!sale) return null;
          const quote = quoteRefund(sale, state.sales, input.lines);
          if (!quote) return null;
          const allowed = new Set(refundMethodsFor(sale));
          if (input.tenders.some((line) => !allowed.has(line.method))) return null;
          const settled = settleSale(quote.total, input.tenders);
          if (!settled) return null;
          const number = state.nextCredit ?? 1;
          const by = actorName(state);
          const now = new Date().toISOString();
          const usedCodes = (state.credits ?? []).map((credit) => credit.number);
          const tenders = settled.tenders.map((line) => {
            if (line.method !== "voucher" || line.voucherCode) return line;
            const voucherCode = newCreditCode(usedCodes);
            usedCodes.push(voucherCode);
            return { ...line, voucherCode };
          });
          const card = tenders.find((line) => line.method === "card" || line.method === "club");
          const note: Sale = {
            id: newId(),
            number,
            createdAt: now,
            lines: quote.lines,
            discountAmount: quote.discountAmount,
            total: quote.total,
            vatRate: quote.vatRate,
            vatAmount: quote.vat,
            net: quote.net,
            method: settled.method,
            tenders,
            kind: "credit",
            creditOfId: sale.id,
            creditOfNumber: sale.number,
            amountDue: settled.amountDue,
            rounding: settled.rounding,
            tendered: settled.tendered,
            change: settled.change,
            voided: false,
            zId: null,
            cashierName: by,
            payments: settled.payments,
            terminal: card?.terminal ?? null,
            authCode: card?.authCode ?? "",
            cardLast4: card?.cardLast4 ?? "",
            cardBrand: card?.cardBrand ?? "",
            channel: sale.channel,
            ...(registerStamp(state) ?? {}),
            business: sale.business,
            publicToken: newReceiptToken(),
          };
          const moves: StockMove[] = [];
          let products = state.products;
          for (const line of quote.lines) {
            if (!line.productId) continue;
            products = products.map((product) => {
              if (product.id !== line.productId || !product.trackStock) return product;
              const changed = changeStock(product, line.variantId, line.qty);
              moves.push({
                id: newId(),
                at: now,
                productId: product.id,
                variantId: line.variantId ?? null,
                productName: changed.name,
                qty: line.qty,
                stockAfter: changed.stockAfter,
                reason: "refund",
                note: `זיכוי ${number} לקבלה ${sale.number}`,
                by,
              });
              return changed.product;
            });
          }
          const issued = issueCreditsForTenders({
            tenders,
            at: now,
            saleId: note.id,
            saleNumber: number,
            registerNo: note.registerNo ?? null,
            registerName: note.registerName ?? "",
            businessName: note.business.businessName,
            token: newReceiptToken,
            id: newId,
          });
          commit({
            sales: [note, ...state.sales],
            nextCredit: number + 1,
            products,
            stockMoves: [...moves, ...state.stockMoves].slice(0, 400),
            ...(issued.length ? { credits: [...(state.credits ?? []), ...issued] } : {}),
          });
          return note;
        },

        markKiosk: (id, status) => {
          const sale = get().sales.find((item) => item.id === id && item.channel === "kiosk");
          if (!sale) return;
          commit({ sales: get().sales.map((item) => (item.id === id ? { ...item, kioskStatus: status } : item)) });
        },

        saveMember: (member) => {
          const firstName = member.firstName.trim().slice(0, 24);
          const lastName = member.lastName.trim().slice(0, 24);
          const phone = member.phone.trim().slice(0, 20);
          if (!firstName || !lastName || phone.replace(/\D/g, "").length < 9) return;
          const next: ClubMember = {
            id: member.id || newId(),
            firstName,
            lastName,
            phone,
            note: member.note.trim().slice(0, 80),
            active: member.active !== false,
            updatedAt: new Date().toISOString(),
          };
          const members = get().members ?? [];
          commit({
            members: members.some((item) => item.id === next.id) ? members.map((item) => (item.id === next.id ? next : item)) : [next, ...members],
          });
        },

        rememberBusinessSettings: (businessId, patch) => {
          const state = get();
          const now = new Date().toISOString();
          const stores = state.stores.map((branch) =>
            branch.id === businessId ? { ...branch, settings: { ...branch.settings, ...patch } } : branch,
          );
          const settings = state.activeStoreId === businessId ? { ...state.settings, ...patch } : state.settings;
          const outbox = state.outbox.map((doc) => {
            if (doc.id !== `settings:${businessId}` || !doc.doc || typeof doc.doc !== "object" || Array.isArray(doc.doc)) return doc;
            return { ...doc, updatedAt: now, doc: { ...doc.doc, ...patch } };
          });
          set({ stores, settings, outbox });
        },

        upsertProduct: (product) => {
          const products = get().products;
          const next = { ...product, updatedAt: new Date().toISOString() };
          commit({
            products: products.some((item) => item.id === next.id)
              ? products.map((item) => (item.id === next.id ? next : item))
              : [next, ...products],
          });
        },

        addCategory: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          const existing = get().categories.find((category) => category.name === trimmed);
          if (existing) return existing.id;
          const id = newId();
          commit({ categories: [...get().categories, { id, name: trimmed.slice(0, 24) }] });
          return id;
        },

        addSupplier: (name) => {
          const trimmed = name.trim().slice(0, 40);
          if (!trimmed) return null;
          const existing = (get().suppliers ?? []).find((supplier) => supplier.name === trimmed);
          if (existing) return existing.id;
          const supplier = { id: newId(), name: trimmed };
          commit({ suppliers: [...(get().suppliers ?? []), supplier] });
          return supplier.id;
        },

        updateSettings: (patch) => {
          const state = get();
          const next = { ...state.settings, ...patch };
          if (patch.vatRate !== undefined) {
            const rate = Number(patch.vatRate);
            next.vatRate = Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : state.settings.vatRate;
          }
          if (patch.openingFloat !== undefined) {
            const float = Number(patch.openingFloat);
            next.openingFloat = Number.isFinite(float) ? Math.max(0, roundMoney(float)) : state.settings.openingFloat;
          }
          if (patch.code !== undefined && !/^\d{6}$/.test(patch.code)) next.code = state.settings.code;
          next.androidTerminal = cleanEndpoint(next.androidTerminal, state.settings.androidTerminal ?? cloneSettings().androidTerminal);
          next.pinpad = cleanEndpoint(next.pinpad, state.settings.pinpad ?? cloneSettings().pinpad);
          if (patch.promos !== undefined) next.promos = cleanPromos(patch.promos);
          if (patch.topShelf !== undefined) next.topShelf = cleanTopShelf(patch.topShelf);
          if (patch.customerSlides !== undefined) next.customerSlides = cleanCustomerSlides(patch.customerSlides);
          if (patch.customerScreen !== undefined) next.customerScreen = patch.customerScreen !== false;
          if (patch.logo !== undefined) {
            const logo = patch.logo;
            next.logo = logo && logo.startsWith("data:image/") && logo.length <= 150_000 ? logo : null;
          } else if (!next.logo || !next.logo.startsWith("data:image/")) {
            next.logo = null;
          }
          commit({ settings: { ...withPrintSettings(next), ...normalizeKioskSettings(next) } });
        },

        adjustStock: (productId, qty, reason, note, variantId) => {
          const state = get();
          const product = state.products.find((item) => item.id === productId);
          if (!product) return;
          const amount = roundMoney(qty);
          if (!Number.isFinite(amount) || amount === 0) return;
          const changed = changeStock({ ...product, trackStock: true }, variantId, amount);
          const move: StockMove = {
            id: newId(),
            at: new Date().toISOString(),
            productId,
            variantId: variantId ?? null,
            productName: changed.name,
            qty: roundMoney(changed.stockAfter - stockOnHand(product, variantId)),
            stockAfter: changed.stockAfter,
            reason,
            note: note.trim().slice(0, 80),
            by: actorName(state),
          };
          commit({
            products: state.products.map((item) => (item.id === productId ? { ...changed.product, trackStock: true } : item)),
            stockMoves: [move, ...state.stockMoves].slice(0, 400),
          });
        },

        openDrawer: () => {
          const state = get();
          const event: DrawerOpen = { id: newId(), at: new Date().toISOString(), by: actorName(state) };
          commit({ drawerOpens: [event, ...state.drawerOpens].slice(0, 200) });
        },

        recordCash: (direction, amount, reason) => {
          const state = get();
          const user = state.staff.find((item) => item.id === state.sessionUserId);
          if (!user) return false;
          const value = roundMoney(amount);
          const why = reason.trim().slice(0, 80);
          if (!(value > 0) || !why) return false;
          const move: CashMove = {
            id: newId(),
            at: new Date().toISOString(),
            direction,
            amount: value,
            reason: why,
            by: user.name,
            employeeId: user.id,
            zId: null,
          };
          commit({ cashMoves: [move, ...(state.cashMoves ?? [])].slice(0, 200) });
          return true;
        },

        closeZ: (cashCounted, leftInDrawer) => {
          const state = get();
          const stamp = registerStamp(state);
          const open = state.sales.filter((sale) => {
            if (sale.zId) return false;
            if (!stamp) return true;
            return sale.registerNo === stamp.registerNo || typeof sale.registerNo !== "number";
          });
          if (!open.length) return null;
          const figures = zFigures(open);
          if (figures.salesCount + figures.creditCount === 0) return null;
          const cashTaken = figures.cashTaken;
          const moves = state.cashMoves ?? [];
          const expected = drawerExpected(state.settings.openingFloat, cashTaken, moves);
          const counted = roundMoney(Math.max(0, cashCounted));
          const left = roundMoney(Math.max(0, leftInDrawer));
          const times = open.map((sale) => new Date(sale.createdAt).getTime());
          const report: ZReport = {
            id: newId(),
            number: state.nextZ,
            closedAt: new Date().toISOString(),
            closedBy: actorName(state),
            storeName: state.settings.businessName,
            ...(stamp ?? {}),
            from: new Date(Math.min(...times)).toISOString(),
            to: new Date(Math.max(...times)).toISOString(),
            salesCount: figures.salesCount,
            voidCount: figures.voidCount,
            turnover: figures.turnover,
            vat: figures.vat,
            net: figures.net,
            byMethod: figures.byMethod,
            creditCount: figures.creditCount,
            creditTotal: figures.creditTotal,
            grossTurnover: figures.gross,
            cashRefunds: figures.cashRefunds,
            promoTotal: roundMoney(
              open.filter((sale) => !sale.voided && !isCredit(sale)).reduce((sum, sale) => sum + (sale.promoAmount ?? 0), 0),
            ),
            promoLines: promoLinesOf(open),
            openingFloat: state.settings.openingFloat,
            cashTaken,
            cashExpected: expected,
            cashCounted: counted,
            variance: drawerVariance(counted, expected),
            paidIn: paidIn(moves),
            paidOut: paidOut(moves),
            leftInDrawer: left,
            drawerOpens: state.drawerOpens.length,
          };
          commit({
            sales: state.sales.map((sale) => (sale.zId ? sale : { ...sale, zId: report.id })),
            zReports: [report, ...state.zReports],
            nextZ: state.nextZ + 1,
            drawerOpens: [],
            cashMoves: moves.map((move) => (move.zId ? move : { ...move, zId: report.id })),
            settings: { ...state.settings, openingFloat: left },
            zToPrint: report,
          });
          return report;
        },

        clearHistory: () => commit({ sales: [], cart: [], discount: null, held: [], zReports: [], drawerOpens: [], cashMoves: [] }),

        resetDemo: () => {
          if (!isDemoMode()) return;
          const stores = freshStores();
          const sales = buildDemoSales(stores[0].settings);
          stores[0] = {
            ...stores[0],
            sales,
            products: applyDemoStock(stores[0].products, sales),
            nextReceipt: 1001 + DEMO_SALE_COUNT,
          };
          const now = new Date().toISOString();
          const staff = defaultStaff();
          set({
            seeded: true,
            activeStoreId: stores[0].id,
            stores,
            staff,
            sessionUserId: get().sessionUserId,
            receiptToPrint: null,
            zToPrint: null,
            lastGoodSync: null,
            appliedReleaseAt: null,
            outbox: snapshotDocs(stores, staff, now),
            ...fromBranch(stores[0]),
          });
        },

        queuePrint: (sale) => set({ receiptToPrint: sale, zToPrint: null }),

        attachReceiptToken: (saleId) => {
          const sale = get().sales.find((item) => item.id === saleId);
          if (!sale) return "";
          if (isReceiptToken(sale.publicToken)) return sale.publicToken;
          const publicToken = newReceiptToken();
          commit({ sales: get().sales.map((item) => (item.id === saleId ? { ...item, publicToken } : item)) });
          return publicToken;
        },
        queueZPrint: (report) => set({ zToPrint: report, receiptToPrint: null }),

        login: (userId, pin) => {
          const state = get();
          const user = state.staff.find((item) => item.id === userId);
          if (!user || !user.active || user.pin !== pin) return false;
          const gate = state.gateStoreId;
          const gated = state.stores.find((branch) => branch.id === gate);
          if (!gate || !gated || !canUseBusiness(gated.id, gated.settings.code) || !canSeeStore(user, gate)) return false;
          if (state.activeStoreId !== gate) {
            const switched = activate(state, gate);
            if (!switched) return false;
            set({ ...switched, sessionUserId: user.id });
            return true;
          }
          set({ sessionUserId: user.id });
          return true;
        },

        lock: () => {
          const state = get();
          const keep = state.registerBusinessId && !state.registerRevoked ? state.registerBusinessId : null;
          set({ sessionUserId: null, gateStoreId: keep });
        },

        switchStore: (id) => {
          const state = get();
          if (state.registerBusinessId && !state.registerRevoked && id !== state.registerBusinessId) return;
          const target = state.stores.find((branch) => branch.id === id);
          if (!target || !canUseBusiness(target.id, target.settings.code)) return;
          if (id === state.activeStoreId) return;
          const user = state.staff.find((item) => item.id === state.sessionUserId);
          if (user && !canSeeStore(user, id)) return;
          const switched = activate(state, id);
          if (!switched) return;
          set(switched);
        },

        setGateStore: (id) => {
          if (!id) {
            set({ gateStoreId: null, sessionUserId: null });
            return;
          }
          const state = get();
          if (state.registerBusinessId && !state.registerRevoked && id !== state.registerBusinessId) return;
          const target = state.stores.find((branch) => branch.id === id);
          if (!target || !canUseBusiness(target.id, target.settings.code)) return;
          const switched = state.activeStoreId === id ? {} : activate(state, id);
          if (!switched) return;
          set({ ...switched, gateStoreId: id, sessionUserId: null });
        },

        addStore: (settings) => {
          const id = `store-${newId().slice(0, 8)}`;
          const used = new Set(get().stores.map((item) => item.settings.code));
          let code = /^\d{6}$/.test(settings.code) ? settings.code : codeForStore(id);
          while (used.has(code)) code = String(100000 + Math.floor(Math.random() * 900000));
          const branch = emptyBranch(id, { ...cloneSettings(), ...settings, code, vatRate: settings.vatRate || 18 });
          const prev = get();
          const stores = prev.stores.map((item) => (item.id === prev.activeStoreId ? toBranch(prev) : item));
          const now = new Date().toISOString();
          set({
            stores: [...stores, branch],
            outbox: mergeOutbox(prev.outbox, [settingsDoc(branch.id, branch.settings, now), catalogDoc(branch, now)]),
          });
          return id;
        },

        saveStaff: (user) => {
          const staff = get().staff;
          const pin = user.pin.trim();
          if (!/^\d{4}$/.test(pin)) return "הקוד צריך 4 ספרות";
          if (!user.name.trim()) return "צריך שם";
          const managers = staff.filter((item) => item.active && item.role === "manager" && item.id !== user.id);
          if (user.role !== "manager" || !user.active) {
            if (managers.length === 0 && staff.some((item) => item.id === user.id && item.role === "manager")) {
              return "חייבים להשאיר מנהל פעיל אחד";
            }
          }
          const next = { ...user, name: user.name.trim().slice(0, 32), pin };
          const staffNext = staff.some((item) => item.id === user.id) ? staff.map((item) => (item.id === user.id ? next : item)) : [...staff, next];
          set({ staff: staffNext, outbox: mergeOutbox(get().outbox, [staffDoc(next, new Date().toISOString())]) });
          return null;
        },

        applyRemote: (docs) => {
          const state = get();
          const next = applyDocs({
            stores: state.stores.map((branch) => (branch.id === state.activeStoreId ? toBranch(state) : branch)),
            staff: state.staff,
            activeStoreId: state.activeStoreId,
            outbox: state.outbox,
            docs,
          });
          const active = next.stores.find((branch) => branch.id === next.activeStoreId) ?? next.stores[0];
          set({
            stores: next.stores,
            staff: next.staff,
            activeStoreId: active.id,
            ...fromBranch(active),
          });
        },

        takePairedBaseline: (docs, businessId) => {
          const state = get();
          const pruned = pruneDemoSeed({ stores: state.stores, staff: state.staff, docs, businessId });
          const outbox = outboxWithoutDropped(state.outbox, pruned.droppedBusinessIds, pruned.droppedStaffIds);
          const active = pruned.stores.find((branch) => branch.id === businessId) ?? pruned.stores[0];
          if (!active) {
            set({ staff: pruned.staff, outbox });
            return false;
          }
          set({
            stores: pruned.stores,
            staff: pruned.staff,
            activeStoreId: active.id,
            outbox,
            ...fromBranch(active),
          });
          return Boolean(businessId) && active.id === businessId;
        },

        replaceOutbox: (docs) => set({ outbox: docs }),

        ackOutbox: (ids) => {
          const drop = new Set(ids);
          set({ outbox: get().outbox.filter((doc) => !drop.has(doc.id)) });
        },

        setCloudCursor: (cursor) => set({ cloudCursor: cursor }),

        adoptRegister: (claim) => {
          const state = get();
          set({
            registerNo: claim.number,
            registerName: claim.name,
            registerBusinessId: claim.businessId,
            registerRevoked: false,
          });
          if (state.sessionUserId || state.cart.length) return;
          if (!state.stores.some((branch) => branch.id === claim.businessId)) return;
          if (state.gateStoreId === claim.businessId && state.activeStoreId === claim.businessId) return;
          get().setGateStore(claim.businessId);
        },

        markRegisterRevoked: () => set({ registerRevoked: true }),

        acceptCloudClock: (serverTime, releaseAt) => {
          const state = get();
          const serverIso = Number.isFinite(Date.parse(serverTime)) ? new Date(serverTime).toISOString() : new Date().toISOString();
          let lastGoodSync = state.lastGoodSync;
          let appliedReleaseAt = state.appliedReleaseAt;
          const lockedBefore = isWeekLocked(lastGoodSync, appliedReleaseAt);
          const releaseMs = releaseAt ? Date.parse(releaseAt) : Number.NaN;
          const startMs = lastGoodSync ? Date.parse(lastGoodSync) : 0;
          const appliedMs = appliedReleaseAt ? Date.parse(appliedReleaseAt) : 0;
          if (Number.isFinite(releaseMs) && releaseMs > startMs && releaseMs > appliedMs) {
            lastGoodSync = serverIso;
            appliedReleaseAt = new Date(releaseMs).toISOString();
          } else if (!lockedBefore) {
            lastGoodSync = serverIso;
          }
          const deviceId = state.deviceId || newId();
          const locked = isWeekLocked(lastGoodSync, appliedReleaseAt);
          const businessId = state.activeStoreId === "store-empty" ? "" : state.activeStoreId;
          const doc = deviceDoc(
            deviceId,
            businessId,
            {
              deviceId,
              locked,
              lastSeen: serverIso,
              businessName: state.settings.businessName,
              businessCode: state.settings.code || "",
            },
            serverIso,
          );
          set({
            deviceId,
            lastGoodSync,
            appliedReleaseAt,
            outbox: mergeOutbox(get().outbox, [doc]),
          });
        },
      };
    },
    {
      name: "kupakal-pos-v1",
      version: 4,
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? memoryStorage() : localStorage)),
      partialize: (state) => ({
        seeded: state.seeded,
        activeStoreId: state.activeStoreId,
        sessionUserId: state.sessionUserId,
        staff: state.staff,
        stores: state.stores.map((branch) => (branch.id === state.activeStoreId ? toBranch(state) : branch)),
        outbox: state.outbox,
        cloudCursor: state.cloudCursor,
        lastGoodSync: state.lastGoodSync,
        appliedReleaseAt: state.appliedReleaseAt,
        deviceId: state.deviceId,
        registerNo: state.registerNo,
        registerName: state.registerName,
        registerBusinessId: state.registerBusinessId,
        registerRevoked: state.registerRevoked,
        gateStoreId: state.gateStoreId,
      }),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") return persisted as PosState;
        const data = persisted as Partial<PosState> & { products?: Product[]; categories?: Category[]; sales?: Sale[] };
        if (version < 2 && Array.isArray(data.products)) {
          const branch = normalizeBranch({
            ...emptyBranch("store-main", data.settings ?? cloneSettings(), data.products),
            categories: data.categories ?? cloneCategories(),
            cart: data.cart ?? [],
            discount: data.discount ?? null,
            held: data.held ?? [],
            sales: data.sales ?? [],
            nextReceipt: data.nextReceipt ?? 1001,
            settings: data.settings ?? cloneSettings(),
          });
          return {
            seeded: true,
            activeStoreId: "store-main",
            sessionUserId: null,
            staff: defaultStaff(),
            stores: [branch],
            outbox: [] as CloudDoc[],
            cloudCursor: null,
            lastGoodSync: null,
            appliedReleaseAt: null,
            deviceId: "",
            gateStoreId: null,
          } as unknown as PosState;
        }
        const next = persisted as PosState;
        return {
          ...next,
          outbox: next.outbox ?? [],
          cloudCursor: next.cloudCursor ?? null,
          lastGoodSync: next.lastGoodSync ?? null,
          appliedReleaseAt: next.appliedReleaseAt ?? null,
          deviceId: next.deviceId ?? "",
          registerNo: next.registerNo ?? null,
          registerName: next.registerName ?? "",
          registerBusinessId: next.registerBusinessId ?? "",
          registerRevoked: next.registerRevoked === true,
          gateStoreId: next.gateStoreId ?? null,
        };
      },
    },
  ),
);

export function ensureReady(): void {
  const state = usePos.getState();
  if (!Array.isArray(state.outbox)) usePos.setState({ outbox: [] });
  if (state.cloudCursor === undefined) usePos.setState({ cloudCursor: null });
  if (!state.stores?.length) {
    if (state.cloudCursor) {
      const empty = emptyBranch("store-empty", { ...cloneSettings(), businessName: "אין עסק פעיל", openingFloat: 0, code: "000000" }, []);
      usePos.setState({ stores: [empty], activeStoreId: empty.id, ...fromBranch(empty) });
    } else {
      const stores = freshStores();
      usePos.setState({
        stores,
        activeStoreId: stores[0].id,
        staff: state.staff?.length ? state.staff : defaultStaff(),
        ...fromBranch(stores[0]),
      });
    }
  }
  const current = usePos.getState();
  const used = new Set<string>();
  const stores = current.stores.map(normalizeBranch).map((branch) => stampCode(branch, used));
  let active = stores.find((branch) => branch.id === current.activeStoreId) ?? stores[0];
  let gateStoreId = current.gateStoreId && stores.some((branch) => branch.id === current.gateStoreId) ? current.gateStoreId : null;
  let sessionUserId = current.sessionUserId;
  if (!isDemoMode()) {
    const gated = stores.find((branch) => branch.id === gateStoreId);
    if (gated && !canUseBusiness(gated.id, gated.settings.code)) gateStoreId = null;
    if (sessionUserId && !canUseBusiness(active.id, active.settings.code)) sessionUserId = null;
  }
  const stableDeviceId = readDeviceId(current.deviceId);
  if (stableDeviceId !== current.deviceId) usePos.setState({ deviceId: stableDeviceId });
  if (!current.seeded) {
    const sales = buildDemoSales(active.settings);
    active = {
      ...active,
      sales,
      products: applyDemoStock(active.products, sales),
      nextReceipt: 1001 + DEMO_SALE_COUNT,
    };
    const nextStores = stores.map((branch) => (branch.id === active.id ? active : branch));
    usePos.setState({
      seeded: true,
      stores: nextStores,
      activeStoreId: active.id,
      staff: current.staff?.length ? current.staff : defaultStaff(),
      gateStoreId,
      sessionUserId,
      ...fromBranch(active),
    });
    return;
  }
  usePos.setState({
    stores,
    activeStoreId: active.id,
    gateStoreId,
    sessionUserId,
    ...fromBranch(active),
  });
}

export function currentUser(state: PosState): StaffUser | null {
  return state.staff.find((user) => user.id === state.sessionUserId) ?? null;
}

export type { Role };
