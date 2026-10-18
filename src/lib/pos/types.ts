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

export type Product = {
  id: string;
  name: string;
  price: number;
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

export type ZReport = {
  id: string;
  number: number;
  closedAt: string;
  closedBy: string;
  storeName: string;
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
  members: ClubMember[];
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
