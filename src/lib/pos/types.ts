export const PAYMENT_METHODS = ["cash", "card", "club", "bit", "paybox", "transfer", "voucher"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TENDER_METHODS = ["cash", "card", "club"] as const;

export type TenderMethod = (typeof TENDER_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "מזומן",
  card: "אשראי",
  club: "כרטיס מועדון",
  bit: "ביט",
  paybox: "פייבוקס",
  transfer: "העברה",
  voucher: "שובר",
};

export type TerminalKind = "android" | "pinpad";

export type TerminalEndpoint = {
  ip: string;
  port: number;
  https: boolean;
};

export type Discount = { kind: "percent" | "amount"; value: number } | null;

export type PromoKind = "bogo" | "bxgy" | "bundle" | "percent" | "amount" | "nth" | "combo" | "threshold";

/** Automatic cart promotion. Missing fields on old registers are filled in on read. */
export type Promo = {
  id: string;
  name: string;
  active: boolean;
  kind: PromoKind;
  stackable: boolean;
  productId: string;
  categoryId: string;
  rewardProductId: string;
  buyQty: number;
  getQty: number;
  bundlePrice: number;
  percent: number;
  amount: number;
  /** Percent off the reward units in buy-X-get-Y. 100 means those units are free. */
  rewardPercent: number;
  /** Products that make up a combo. Empty for every other kind. */
  productIds: string[];
  /** Spend that unlocks a cart-threshold deal. 0 for every other kind. */
  minSpend: number;
  /** 0 is Sunday. Empty means every day. */
  days: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
};

export type Category = { id: string; name: string };

export type Extra = {
  id: string;
  name: string;
  price: number;
};

/** A size or other sellable version. Each one has its own price, code, and stock. */
export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  sku: string;
  barcode: string;
  stock: number;
  active: boolean;
};

export type ModifierOption = {
  id: string;
  name: string;
  price: number;
};

/** Rules are min/max. Required means min is at least 1. Exactly one is min = max = 1. */
export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
};

export type ChosenModifier = {
  groupId: string;
  optionId: string;
  name: string;
  price: number;
};

export type Shelf = "upper" | "lower" | "off";

/** One slot on the top quick shelf. A category slot expands to that category's products. */
export type ShelfRef = { kind: "product" | "category"; id: string };

export type Supplier = { id: string; name: string };

export type Product = {
  id: string;
  name: string;
  price: number;
  /** What the shop paid. Missing on older products. */
  cost?: number;
  /** Supplier from the shared list. Empty when none is set. */
  supplierId?: string;
  categoryId: string;
  sku: string;
  /** Extra scan code. Older products leave this empty and keep using `sku`. */
  barcode?: string;
  favorite: boolean;
  active: boolean;
  image: string | null;
  trackStock: boolean;
  stock: number;
  lowStock: number;
  /** Which equal shelf on the sale screen. `off` keeps it out of the register grid. */
  shelf: Shelf;
  /** Shown on the customer kiosk. */
  kiosk: boolean;
  extras: Extra[];
  /** Empty on older products. When present, the register sells these instead of the parent price. */
  variants?: ProductVariant[];
  /** Empty on older products. Extras stay as one optional group until a group is saved. */
  modifierGroups?: ModifierGroup[];
  /** When the name, price, or other details last changed. Stock moves do not bump this. */
  updatedAt?: string;
};

export type CartLine = {
  key: string;
  productId: string | null;
  variantId?: string | null;
  sku?: string;
  name: string;
  unitPrice: number;
  qty: number;
  modifiers?: ChosenModifier[];
};

export type HeldOrder = {
  id: string;
  createdAt: string;
  lines: CartLine[];
  discount: Discount;
};

export type BusinessSnapshot = {
  businessName: string;
  ownerName: string;
  taxId: string;
  address: string;
  phone: string;
  receiptFooter: string;
};

export type SaleLine = {
  productId: string | null;
  variantId?: string | null;
  sku?: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  modifiers?: ChosenModifier[];
  /** On a credit note, the line index in the original sale. */
  sourceIndex?: number;
};

export type TenderLine = {
  method: PaymentMethod;
  /** Amount applied to the bill. Cash change is not included. */
  amount: number;
  /** What the customer handed over. Equals `amount` except for cash. */
  tendered: number;
  change: number;
  /** Cash rounding on this slice. Zero for every other method. */
  rounding: number;
  payments?: number;
  terminal?: TerminalKind | null;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  voucherCode?: string;
};

export type Sale = {
  id: string;
  number: number;
  createdAt: string;
  lines: SaleLine[];
  discountAmount: number;
  /** Automatic promotion taken off before the manual discount. Missing on older sales. */
  promoAmount?: number;
  promoLabel?: string;
  /** One row per promotion that applied. Missing on older sales, which keep the single label. */
  promoHits?: { id: string; name: string; amount: number }[];
  total: number;
  vatRate: number;
  vatAmount: number;
  net: number;
  method: PaymentMethod;
  /** One entry per payment. Older sales only have `method` and are migrated on read. */
  tenders?: TenderLine[];
  /** `credit` is a תעודת זיכוי. Missing means a normal sale. */
  kind?: "sale" | "credit";
  creditOfId?: string | null;
  creditOfNumber?: number | null;
  amountDue: number;
  rounding: number;
  tendered: number;
  change: number;
  voided: boolean;
  zId: string | null;
  cashierName: string;
  business: BusinessSnapshot;
  payments?: number;
  terminal?: TerminalKind | null;
  authCode?: string;
  cardLast4?: string;
  cardBrand?: string;
  channel?: "register" | "kiosk";
  /** Register that made the sale. Missing on sales from before numbered registers. */
  registerNo?: number;
  registerName?: string;
  kioskStatus?: "new" | "done" | null;
  /** Unguessable id for the public receipt page. Missing on sales from before SMS links. */
  publicToken?: string;
};

export type Settings = BusinessSnapshot & {
  vatRate: number;
  openingFloat: number;
  /** 6-digit code typed at the register before the staff list. */
  code: string;
  androidTerminal: TerminalEndpoint;
  pinpad: TerminalEndpoint;
  /** JPEG data URL uploaded from the control panel. Null until the owner adds one. */
  logo: string | null;
  /** Print a receipt as soon as a payment is confirmed. Older registers default this to on. */
  autoPrint: boolean;
  /** Thermal roll width in millimetres. */
  paperWidth: 58 | 80;
  /** USB product name to print to. "Default" is the usual thermal printer. */
  printerName: string;
  /** Kick the cash drawer when a payment includes cash. */
  openDrawer: boolean;
  /** Seconds of quiet before the kiosk asks if anyone is still there. */
  kioskIdleSec?: number;
  /** Countdown after that question, then the cart is cleared. */
  kioskWarnSec?: number;
  /** Pin the Android app so a customer cannot leave it. */
  kioskLock?: boolean;
  kioskSlides?: KioskSlide[];
  upsellRules?: UpsellRule[];
  /** Automatic promotions. Missing on registers that have not set any. */
  promos?: Promo[];
  /** Ordered top shelf. Missing means products still use their own shelf flag. */
  topShelf?: ShelfRef[];
  /**
   * How a finished sale asks for the receipt.
   * Missing on older registers: they keep printing when autoPrint is on.
   */
  receiptDelivery?: ReceiptDelivery;
  /** Customer-facing second screen. Missing means on, and it stays quiet without a second display. */
  customerScreen?: boolean;
  /** Idle slideshow for the customer screen. Configured in Back Office. */
  customerSlides?: KioskSlide[];
};

export type ReceiptDelivery = "print" | "ask" | "digital";

export type PunchKind = "in" | "out" | "break-start" | "break-end";

export type PunchEdit = {
  at: string;
  byId: string;
  byName: string;
  why: string;
  previousAt: string;
};

/** One clock event. Corrections keep `originalAt` and append `edits`. */
export type TimePunch = {
  id: string;
  staffId: string;
  staffName: string;
  kind: PunchKind;
  at: string;
  originalAt: string;
  registerNo: number | null;
  registerName: string;
  storeId: string;
  voided: boolean;
  edits: PunchEdit[];
  /** Set when a manager added a punch that the employee never made. */
  added?: { at: string; byId: string; byName: string; why: string };
};

export type StoreCreditRedemption = {
  at: string;
  amount: number;
  saleId: string;
  saleNumber: number;
  registerNo: number | null;
};

/** Store credit issued from a voucher refund. The short `number` is what a scanner reads. */
export type StoreCredit = {
  id: string;
  number: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  original: number;
  balance: number;
  saleId: string;
  saleNumber: number;
  voided: boolean;
  redemptions: StoreCreditRedemption[];
  registerNo: number | null;
  registerName: string;
  businessName: string;
};

export type KioskSlide = {
  id: string;
  image: string;
  caption: string;
};

export type UpsellRule = {
  id: string;
  productId: string;
  categoryId: string;
  suggestIds: string[];
};

export type ClubMember = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  note: string;
  active: boolean;
  updatedAt?: string;
};

export type StockReason = "sale" | "void" | "refund" | "receive" | "count" | "waste";

export type StockMove = {
  id: string;
  at: string;
  productId: string;
  variantId?: string | null;
  productName: string;
  qty: number;
  stockAfter: number;
  reason: StockReason;
  note: string;
  by: string;
};

export type DrawerOpen = {
  id: string;
  at: string;
  by: string;
};

/** Cash put into the drawer or taken out, apart from a sale. */
export type CashMove = {
  id: string;
  at: string;
  direction: "in" | "out";
  amount: number;
  reason: string;
  by: string;
  employeeId: string;
  /** Set when the shift Z closes, so the next shift starts clean. */
  zId: string | null;
};

export type ZReport = {
  id: string;
  number: number;
  closedAt: string;
  closedBy: string;
  storeName: string;
  /** Register that closed the shift. Missing on older reports. */
  registerNo?: number;
  registerName?: string;
  from: string;
  to: string;
  salesCount: number;
  voidCount: number;
  turnover: number;
  vat: number;
  net: number;
  byMethod: { method: PaymentMethod; total: number; sales?: number; refunds?: number }[];
  /** Present on reports closed after credit notes existed. Turnover is already net of these. */
  creditCount?: number;
  creditTotal?: number;
  grossTurnover?: number;
  cashRefunds?: number;
  openingFloat: number;
  cashTaken: number;
  cashExpected: number;
  cashCounted: number;
  variance: number;
  /** Pay-ins during the shift. Missing on reports from before cash moves. */
  paidIn?: number;
  /** Pay-outs during the shift. */
  paidOut?: number;
  /** Promotions given on the sales in this report. Older reports omit it. */
  promoTotal?: number;
  /** Same promotions, one line per name. Older reports omit it. */
  promoLines?: { name: string; amount: number }[];
  leftInDrawer: number;
  drawerOpens: number;
};

export type Branch = {
  id: string;
  categories: Category[];
  products: Product[];
  cart: CartLine[];
  discount: Discount;
  held: HeldOrder[];
  sales: Sale[];
  nextReceipt: number;
  /** Next תעודת זיכוי number. Older registers default this to 1. */
  nextCredit: number;
  settings: Settings;
  zReports: ZReport[];
  nextZ: number;
  stockMoves: StockMove[];
  drawerOpens: DrawerOpen[];
  /** Pay-ins and pay-outs. Older registers load this as an empty list. */
  cashMoves: CashMove[];
  members: ClubMember[];
  /** Shared supplier list. Older registers load this as an empty list. */
  suppliers: Supplier[];
  /** Clock punches. Older registers load this as an empty list. */
  punches: TimePunch[];
  /** Store-credit notes. Older registers load this as an empty list. */
  credits: StoreCredit[];
};

export type Role = "cashier" | "shift" | "manager";

export const ROLE_LABEL: Record<Role, string> = {
  cashier: "קופאי",
  shift: "אחראי משמרת",
  manager: "מנהל",
};

export type StaffUser = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  active: boolean;
  storeIds: string[];
};

export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  sale: "מכירה",
  void: "ביטול",
  refund: "החזרה",
  receive: "קבלת סחורה",
  count: "ספירה",
  waste: "פחת",
};
