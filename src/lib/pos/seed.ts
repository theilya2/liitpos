import { computeTotals, roundCash, roundMoney } from "@/lib/pos/money";
import type { Branch, Category, ClubMember, Extra, PaymentMethod, Product, Promo, Sale, Settings, Shelf, StaffUser } from "@/lib/pos/types";

export const defaultCategories: Category[] = [
  { id: "hot", name: "משקאות חמים" },
  { id: "cold", name: "משקאות קרים" },
  { id: "bake", name: "מאפים" },
  { id: "snack", name: "חטיפים" },
  { id: "fridge", name: "מקרר" },
  { id: "pantry", name: "מזווה" },
  { id: "clean", name: "ניקיון" },
];

export const defaultSettings: Settings = {
  businessName: "מכולת השכונה",
  ownerName: "נועה לוי",
  taxId: "514778921",
  address: "הרצל 18, רמת גן",
  phone: "03-612-4400",
  receiptFooter: "תודה שקניתם אצלנו. נשמח לראותכם שוב.",
  vatRate: 18,
  openingFloat: 300,
  code: "100001",
  androidTerminal: { ip: "", port: 8088, https: false },
  pinpad: { ip: "", port: 8890, https: false },
  logo: null,
  autoPrint: true,
  paperWidth: 80,
  printerName: "Default",
  openDrawer: true,
  promos: demoPromos(),
};

function demoPromos(): Promo[] {
  const base = {
    active: true,
    stackable: false,
    productId: "",
    categoryId: "",
    rewardProductId: "",
    buyQty: 1,
    getQty: 1,
    bundlePrice: 0,
    percent: 0,
    amount: 0,
    rewardPercent: 100,
    productIds: [] as string[],
    minSpend: 0,
    days: [] as number[],
    startTime: "",
    endTime: "",
    startDate: "",
    endDate: "",
  };
  return [
    { ...base, id: "promo-cola", name: "קולה 3 ב-20", kind: "bundle", productId: "p-cola", buyQty: 3, bundlePrice: 20 },
    { ...base, id: "promo-borek", name: "בורקס 1+1", kind: "bogo", productId: "p-borek-c" },
    { ...base, id: "promo-second", name: "אספרסו שני בחצי", kind: "nth", productId: "p-espresso", buyQty: 2, percent: 50 },
    { ...base, id: "promo-combo", name: "קפה ומאפה", kind: "combo", productIds: ["p-cap", "p-borek-c"], bundlePrice: 22 },
    { ...base, id: "promo-cart", name: "מ-80 הנחה", kind: "threshold", minSpend: 80, percent: 10 },
  ];
}

type SeedProduct = Omit<Product, "active" | "image" | "trackStock" | "stock" | "lowStock" | "shelf" | "kiosk" | "extras"> & {
  active?: boolean;
  shelf?: Shelf;
  kiosk?: boolean;
  extras?: Extra[];
};

const DRINK_EXTRAS: Extra[] = [
  { id: "shot", name: "שוט נוסף", price: 4 },
  { id: "oat", name: "חלב שיבולת שועל", price: 3 },
];

const BAKE_EXTRAS: Extra[] = [
  { id: "egg", name: "ביצה", price: 3 },
  { id: "cheese", name: "גבינה נוספת", price: 4 },
];

export const DEMO_PHOTO: Record<string, string> = {
  "p-espresso": "/pos/espresso.jpg",
  "p-cap": "/pos/cappuccino.jpg",
  "p-cola": "/pos/cola.jpg",
  "p-water": "/pos/water.jpg",
  "p-borek-c": "/pos/borek.jpg",
  "p-bread": "/pos/bread.jpg",
  "p-bamba": "/pos/bamba.jpg",
  "p-milk": "/pos/milk.jpg",
};

const DEMO_SHELF: Record<string, Shelf> = {
  "p-espresso": "upper",
  "p-cap": "upper",
  "p-cola": "upper",
  "p-borek-c": "upper",
  "p-water": "lower",
  "p-bread": "lower",
  "p-bamba": "lower",
  "p-milk": "lower",
};

export function demoPhoto(id: string): string | null {
  return DEMO_PHOTO[id] ?? null;
}

export function demoShelf(id: string): Shelf | null {
  return DEMO_SHELF[id] ?? null;
}

export function demoExtras(id: string): Extra[] {
  if (id === "p-espresso" || id === "p-cap" || id === "k-cold") return DRINK_EXTRAS.map((extra) => ({ ...extra }));
  if (id === "p-borek-c" || id === "k-sandwich") return BAKE_EXTRAS.map((extra) => ({ ...extra }));
  return [];
}

export function demoKiosk(id: string): boolean {
  return id in DEMO_SHELF || id.startsWith("k-");
}

export function demoMembers(): ClubMember[] {
  return [
    { id: "m-dana", firstName: "דנה", lastName: "אביב", phone: "050-412-8800", note: "קפה על חשבון הבית בימי שישי", active: true },
    { id: "m-yossi", firstName: "יוסי", lastName: "חדד", phone: "052-667-1904", note: "", active: true },
    { id: "m-michal", firstName: "מיכל", lastName: "ברק", phone: "054-220-1188", note: "", active: true },
  ];
}

const catalog: SeedProduct[] = [
  { id: "p-espresso", name: "אספרסו", price: 11, categoryId: "hot", sku: "2001", favorite: true },
  { id: "p-black", name: "קפה שחור", price: 8, categoryId: "hot", sku: "2002", favorite: false },
  { id: "p-cap", name: "קפוצ׳ינו", price: 14, categoryId: "hot", sku: "2003", favorite: true },
  { id: "p-mint", name: "תה נענע", price: 9, categoryId: "hot", sku: "2004", favorite: false },
  { id: "p-cocoa", name: "שוקו חם", price: 12, categoryId: "hot", sku: "2005", favorite: false },
  { id: "p-cola", name: "קולה 1.5 ל׳", price: 9.9, categoryId: "cold", sku: "2101", favorite: true },
  { id: "p-zero", name: "קולה זירו פחית", price: 7.5, categoryId: "cold", sku: "2102", favorite: false },
  { id: "p-sprite", name: "ספרייט 1.5 ל׳", price: 9.9, categoryId: "cold", sku: "2103", favorite: false },
  { id: "p-water", name: "מים מינרליים 1.5 ל׳", price: 5.9, categoryId: "cold", sku: "2104", favorite: true },
  { id: "p-soda", name: "מים מוגזים", price: 6.5, categoryId: "cold", sku: "2105", favorite: false },
  { id: "p-oj", name: "מיץ תפוזים", price: 16, categoryId: "cold", sku: "2106", favorite: false },
  { id: "p-beer", name: "בירה גולדסטאר", price: 12, categoryId: "cold", sku: "2107", favorite: false },
  { id: "p-borek-c", name: "בורקס גבינה", price: 14, categoryId: "bake", sku: "2201", favorite: true },
  { id: "p-borek-p", name: "בורקס תפו״א", price: 14, categoryId: "bake", sku: "2202", favorite: false },
  { id: "p-rug", name: "רוגלך", price: 9, categoryId: "bake", sku: "2203", favorite: false },
  { id: "p-bread", name: "לחם אחיד", price: 8.5, categoryId: "bake", sku: "2204", favorite: true },
  { id: "p-roll", name: "לחמנייה", price: 4, categoryId: "bake", sku: "2205", favorite: false },
  { id: "p-cookie", name: "עוגיית שוקולד", price: 5, categoryId: "bake", sku: "2206", favorite: false },
  { id: "p-bamba", name: "במבה 80 גרם", price: 6.9, categoryId: "snack", sku: "2301", favorite: true },
  { id: "p-bisli", name: "ביסלי גריל", price: 6.9, categoryId: "snack", sku: "2302", favorite: false },
  { id: "p-para", name: "שוקולד פרה", price: 8.9, categoryId: "snack", sku: "2303", favorite: false },
  { id: "p-waffle", name: "וופל", price: 5.5, categoryId: "snack", sku: "2304", favorite: false },
  { id: "p-bar", name: "חטיף דגנים", price: 7.5, categoryId: "snack", sku: "2305", favorite: false },
  { id: "p-milk", name: "חלב 3% 1 ל׳", price: 7.2, categoryId: "fridge", sku: "2401", favorite: true },
  { id: "p-cottage", name: "קוטג׳ 5%", price: 7.5, categoryId: "fridge", sku: "2402", favorite: false },
  { id: "p-eggs", name: "ביצים L תריסר", price: 16.9, categoryId: "fridge", sku: "2403", favorite: false },
  { id: "p-cheese", name: "גבינה צהובה 200 גרם", price: 19.9, categoryId: "fridge", sku: "2404", favorite: false },
  { id: "p-yogurt", name: "יוגורט", price: 5.2, categoryId: "fridge", sku: "2405", favorite: false },
  { id: "p-butter", name: "חמאה 200 גרם", price: 12.9, categoryId: "fridge", sku: "2406", favorite: false },
  { id: "p-hummus", name: "חומוס 400 גרם", price: 13.9, categoryId: "pantry", sku: "2501", favorite: false },
  { id: "p-tahini", name: "טחינה 500 גרם", price: 21.9, categoryId: "pantry", sku: "2502", favorite: false },
  { id: "p-rice", name: "אורז 1 ק״ג", price: 11.9, categoryId: "pantry", sku: "2503", favorite: false },
  { id: "p-pasta", name: "פסטה 500 גרם", price: 7.5, categoryId: "pantry", sku: "2504", favorite: false },
  { id: "p-oil", name: "שמן קנולה 1 ל׳", price: 14.9, categoryId: "pantry", sku: "2505", favorite: false },
  { id: "p-tuna", name: "טונה", price: 9.9, categoryId: "pantry", sku: "2506", favorite: false },
  { id: "p-paper", name: "נייר טואלט 32 גלילים", price: 39.9, categoryId: "clean", sku: "2601", favorite: false },
  { id: "p-dish", name: "נוזל כלים", price: 12.9, categoryId: "clean", sku: "2602", favorite: false },
  { id: "p-bleach", name: "אקונומיקה", price: 9.5, categoryId: "clean", sku: "2603", favorite: false },
];

const LOW_STOCK = new Set(["p-bamba", "p-water", "p-tuna"]);

export function cloneProducts(): Product[] {
  return catalog.map((product) => ({
    ...product,
    active: product.active ?? true,
    image: demoPhoto(product.id),
    trackStock: true,
    stock: LOW_STOCK.has(product.id) ? 3 : product.favorite ? 28 : 16,
    lowStock: 5,
    shelf: product.shelf ?? demoShelf(product.id) ?? "off",
    kiosk: product.kiosk ?? demoKiosk(product.id),
    extras: product.extras ?? demoExtras(product.id),
  }));
}

export function cloneCategories(): Category[] {
  return defaultCategories.map((category) => ({ ...category }));
}

export function cloneSettings(): Settings {
  return { ...defaultSettings };
}

/** Stable entry code so a register and the control panel agree before the code is saved. */
export function codeForStore(id: string): string {
  if (id === "store-main") return "100001";
  if (id === "store-kiosk") return "200002";
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  return String(100000 + (hash % 900000));
}

const bills = [20, 50, 100, 200];

function cashTendered(amountDue: number): number {
  return bills.find((bill) => bill + 0.001 >= amountDue) ?? amountDue;
}

type Sample = {
  hoursAgo: number;
  method: PaymentMethod;
  lines: [string, number, number][];
};

const samples: Sample[] = [
  { hoursAgo: 0.35, method: "cash", lines: [["אספרסו", 11, 2], ["בורקס גבינה", 14, 1]] },
  { hoursAgo: 1.2, method: "bit", lines: [["במבה 80 גרם", 6.9, 2], ["מים מינרליים 1.5 ל׳", 5.9, 1]] },
  {
    hoursAgo: 2.5,
    method: "card",
    lines: [
      ["חלב 3% 1 ל׳", 7.2, 2],
      ["ביצים L תריסר", 16.9, 1],
      ["לחם אחיד", 8.5, 1],
    ],
  },
  { hoursAgo: 4, method: "paybox", lines: [["קפוצ׳ינו", 14, 1], ["רוגלך", 9, 2]] },
  { hoursAgo: 22, method: "cash", lines: [["שמן קנולה 1 ל׳", 14.9, 1], ["אורז 1 ק״ג", 11.9, 1]] },
  { hoursAgo: 30, method: "card", lines: [["נייר טואלט 32 גלילים", 39.9, 1]] },
  { hoursAgo: 52, method: "transfer", lines: [["גבינה צהובה 200 גרם", 19.9, 2], ["חמאה 200 גרם", 12.9, 1]] },
];

export function buildDemoSales(settings: Settings): Sale[] {
  const business = {
    businessName: settings.businessName,
    ownerName: settings.ownerName,
    taxId: settings.taxId,
    address: settings.address,
    phone: settings.phone,
    receiptFooter: settings.receiptFooter,
  };
  const chronological = [...samples].reverse();
  const sales = chronological.map((sample, index) => {
    const lines = sample.lines.map(([name, unitPrice, qty]) => ({
      productId: null as string | null,
      name,
      unitPrice,
      qty,
      lineTotal: roundMoney(unitPrice * qty),
    }));
    const totals = computeTotals(lines, null, settings.vatRate);
    const amountDue = sample.method === "cash" ? roundCash(totals.total) : totals.total;
    const tendered = sample.method === "cash" ? cashTendered(amountDue) : amountDue;
    const number = 1001 + index;
    const sale: Sale = {
      id: `demo-${number}`,
      number,
      createdAt: new Date(Date.now() - sample.hoursAgo * 3600_000).toISOString(),
      lines,
      discountAmount: 0,
      total: totals.total,
      vatRate: settings.vatRate,
      vatAmount: totals.vat,
      net: totals.net,
      method: sample.method,
      amountDue,
      rounding: roundMoney(amountDue - totals.total),
      tendered,
      change: roundMoney(tendered - amountDue),
      voided: false,
      zId: null,
      cashierName: "דנה אביב",
      business,
    };
    return sale;
  });
  return sales.reverse();
}

export const DEMO_RECEIPT_START = 1001;
export const DEMO_SALE_COUNT = samples.length;

export function emptyBranch(id: string, settings: Settings, products: Product[] = []): Branch {
  return {
    id,
    categories: cloneCategories(),
    products,
    cart: [],
    discount: null,
    held: [],
    sales: [],
    nextReceipt: 1001,
    nextCredit: 1,
    settings,
    zReports: [],
    nextZ: 1,
    stockMoves: [],
    drawerOpens: [],
    cashMoves: [],
    members: [],
    suppliers: [],
  };
}

export function mainBranch(): Branch {
  return { ...emptyBranch("store-main", cloneSettings(), cloneProducts()), members: demoMembers() };
}

export function kioskBranch(): Branch {
  const settings: Settings = {
    ...cloneSettings(),
    businessName: "קיוסק הים",
    address: "הטיילת 4, תל אביב",
    phone: "03-555-0190",
    taxId: "558120334",
    openingFloat: 200,
    receiptFooter: "קיץ נעים. תודה שקפצתם.",
    code: "200002",
  };
  const products: Product[] = [
    { id: "k-water", name: "מים קרים", price: 8, categoryId: "cold", sku: "3101", favorite: true, active: true, image: "/pos/water.jpg", trackStock: true, stock: 40, lowStock: 8, shelf: "upper", kiosk: true, extras: [] },
    { id: "k-ice", name: "ארטיק", price: 7, categoryId: "snack", sku: "3102", favorite: true, active: true, image: null, trackStock: true, stock: 18, lowStock: 6, shelf: "upper", kiosk: true, extras: [] },
    { id: "k-cold", name: "קפה קר", price: 14, categoryId: "hot", sku: "3103", favorite: false, active: true, image: "/pos/cappuccino.jpg", trackStock: true, stock: 12, lowStock: 4, shelf: "lower", kiosk: true, extras: demoExtras("k-cold") },
    { id: "k-bamba", name: "במבה", price: 7, categoryId: "snack", sku: "3104", favorite: false, active: true, image: "/pos/bamba.jpg", trackStock: true, stock: 4, lowStock: 5, shelf: "lower", kiosk: true, extras: [] },
    { id: "k-sandwich", name: "כריך טונה", price: 22, categoryId: "bake", sku: "3105", favorite: false, active: true, image: "/pos/borek.jpg", trackStock: true, stock: 8, lowStock: 3, shelf: "upper", kiosk: true, extras: demoExtras("k-sandwich") },
  ];
  return { ...emptyBranch("store-kiosk", settings, products), categories: cloneCategories().filter((category) => ["cold", "hot", "snack", "bake"].includes(category.id)) };
}

export function defaultStaff(): StaffUser[] {
  return [
    { id: "u-manager", name: "נועה לוי", pin: "1111", role: "manager", active: true, storeIds: [] },
    { id: "u-shift", name: "יוסי חדד", pin: "2222", role: "shift", active: true, storeIds: ["store-main"] },
    { id: "u-cashier", name: "דנה אביב", pin: "3333", role: "cashier", active: true, storeIds: ["store-main"] },
  ];
}
