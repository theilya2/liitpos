import { useEffect, useRef, useState } from "react";
import { formatILS, roundMoney } from "@/lib/pos/money";

function reduceMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A small chip that travels from a product into the ticket. Transform only. */
export function flyChip(source: HTMLElement, label: string) {
  if (reduceMotion()) return;
  const from = source.getBoundingClientRect();
  const ticket = document.querySelector(".register-ticket")?.getBoundingClientRect();
  const node = document.createElement("span");
  node.className = "fly-chip";
  node.textContent = label.trim().slice(0, 1) || "•";
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.setProperty("--fly-x", `${(ticket ? ticket.left + ticket.width * 0.55 : x) - x}px`);
  node.style.setProperty("--fly-y", `${(ticket ? ticket.top + 40 : y - 72) - y}px`);
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 700);
}

export function LiveTotal({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (reduceMotion() || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 320);
      const eased = 1 - (1 - p) ** 3;
      setShown(start + (value - start) * eased);
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{formatILS(roundMoney(shown))}</span>;
}

export function PayBurst() {
  return (
    <div className="pay-burst" aria-hidden="true">
      <span className="pay-check">✓</span>
      {Array.from({ length: 14 }, (_, index) => (
        <i key={index} className={`confetti c${index}`} />
      ))}
    </div>
  );
}
