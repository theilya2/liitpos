export type LockPhase = "checking" | "offline" | "local" | "syncing" | "synced" | "error" | "revoked";

export type LockView =
  | { kind: "code" }
  | { kind: "unpaired" }
  | { kind: "loading" }
  | { kind: "failed"; detail: string }
  | { kind: "pin"; emptyStaff: boolean };

export const MISSING_BUSINESS_DETAIL = "העסק של הקופה לא הגיע מהשרת. בודקים שהקופה משויכת לעסק במשרד האחורי.";

export function lockView(input: {
  demo: boolean;
  paired: boolean;
  businessReady: boolean;
  staffCount: number;
  phase: LockPhase;
  detail: string;
  attempt: number;
}): LockView {
  if (input.demo) return { kind: "code" };
  if (!input.paired) return { kind: "unpaired" };
  if (input.phase === "revoked") return { kind: "failed", detail: input.detail.trim() || "הקופה נותקה." };
  if (input.businessReady) return { kind: "pin", emptyStaff: input.staffCount === 0 };
  if (input.phase === "error" || input.phase === "offline") {
    return { kind: "failed", detail: input.detail.trim() || "לא הצלחנו לטעון את העסק." };
  }
  if (input.attempt === 0 || input.phase === "checking" || input.phase === "syncing") return { kind: "loading" };
  if (input.phase === "synced") return { kind: "failed", detail: MISSING_BUSINESS_DETAIL };
  const detail = input.detail.trim();
  return { kind: "failed", detail: detail || "לא הצלחנו לטעון את העסק." };
}
