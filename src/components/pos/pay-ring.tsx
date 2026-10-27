export function PayRing({ phase }: { phase: "wait" | "ok" | "fail" }) {
  const label = phase === "wait" ? "ממתינים…" : phase === "ok" ? "אושר" : "נכשל";
  const mark = phase === "ok" ? "✓" : phase === "fail" ? "✕" : "";
  return (
    <div className="pay-ring" data-phase={phase} role="status" aria-live="polite">
      <span className={`pay-ring-disc ${phase === "wait" ? "is-wait" : "is-done"}`} aria-hidden="true">
        {mark ? <span className="pay-ring-mark">{mark}</span> : null}
      </span>
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}
