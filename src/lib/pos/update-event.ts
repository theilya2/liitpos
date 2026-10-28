export const UPDATE_EVENT = "liitpos-update";

export type UpdatePhase = "progress" | "permission" | "installing" | "error" | "done";

export type UpdateNotice = {
  phase: UpdatePhase;
  percent: number | null;
  message: string;
};

const FALLBACK_ERROR = "העדכון נכשל. נסו שוב.";

export function readUpdateEvent(detail: unknown): UpdateNotice | null {
  if (!detail || typeof detail !== "object") return null;
  const raw = detail as { phase?: unknown; percent?: unknown; message?: unknown };
  const phase = raw.phase;
  if (phase !== "progress" && phase !== "permission" && phase !== "installing" && phase !== "error" && phase !== "done") {
    return null;
  }
  const written = typeof raw.message === "string" ? raw.message.trim() : "";
  const message = written || (phase === "error" ? FALLBACK_ERROR : "");
  let percent: number | null = null;
  if (typeof raw.percent === "number" && Number.isFinite(raw.percent) && raw.percent >= 0) {
    percent = Math.max(0, Math.min(100, Math.round(raw.percent)));
  }
  return { phase, percent, message };
}
