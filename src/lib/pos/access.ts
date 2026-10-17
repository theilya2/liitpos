import type { Role, StaffUser } from "@/lib/pos/types";

export type Area = "sale" | "receipts" | "inventory" | "reports" | "z" | "products" | "settings" | "manage" | "void" | "refund" | "drawer";

const AREAS: Record<Role, Area[]> = {
  cashier: ["sale", "receipts", "drawer"],
  shift: ["sale", "receipts", "drawer", "inventory", "reports", "z", "void", "refund"],
  manager: ["sale", "receipts", "drawer", "inventory", "reports", "z", "void", "refund", "products", "settings", "manage"],
};

export function can(role: Role, area: Area): boolean {
  return AREAS[role].includes(area);
}

export function canSeeStore(user: StaffUser, storeId: string): boolean {
  if (!user.active) return false;
  if (user.storeIds.length === 0) return user.role === "manager";
  return user.storeIds.includes(storeId);
}

export function areaForPath(pathname: string): Area {
  if (pathname.startsWith("/receipts")) return "receipts";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/manage")) return "manage";
  return "sale";
}
