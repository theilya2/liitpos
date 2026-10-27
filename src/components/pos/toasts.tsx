import { useSyncExternalStore } from "react";

type Toast = {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  ttl: number;
};

let items: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 1;

function emit() {
  for (const listener of listeners) listener();
}

export function pushToast(text: string, options?: { actionLabel?: string; onAction?: () => void; ttl?: number }) {
  const toast: Toast = {
    id: seq++,
    text,
    actionLabel: options?.actionLabel,
    onAction: options?.onAction,
    ttl: options?.ttl ?? 2800,
  };
  items = [...items, toast].slice(-3);
  emit();
  window.setTimeout(() => dismissToast(toast.id), toast.ttl);
}

export function dismissToast(id: number) {
  if (!items.some((toast) => toast.id === id)) return;
  items = items.filter((toast) => toast.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribe, () => items, () => items);
  if (!toasts.length) return null;
  return (
    <div className="toast-stack no-print" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-card">
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {toast.actionLabel && toast.onAction ? (
            <button
              type="button"
              className="shrink-0 font-semibold text-pine"
              onClick={() => {
                toast.onAction?.();
                dismissToast(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
