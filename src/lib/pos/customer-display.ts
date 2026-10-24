import { registerPlugin, WebPlugin } from "@capacitor/core";
import { useSyncExternalStore } from "react";

export type CustomerPayload = {
  mode: "idle" | "cart" | "pay" | "thanks";
  business: string;
  logo: string;
  slides: { image: string; caption: string }[];
  lines: { name: string; qty: number; total: string }[];
  discounts: { name: string; amount: string }[];
  total: string;
  pay: string;
  thanks: string;
  qr: string;
};

type CustomerDisplayPlugin = {
  getInfo(): Promise<{ count: number; available: boolean }>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  update(options: { payload: string }): Promise<void>;
};

class CustomerDisplayWeb extends WebPlugin implements CustomerDisplayPlugin {
  async getInfo() {
    return { count: 0, available: false };
  }
  async setEnabled() {}
  async update() {}
}

const plugin = registerPlugin<CustomerDisplayPlugin>("CustomerDisplay", {
  web: () => new CustomerDisplayWeb(),
});

export type CustomerPhase = { mode: "selling" } | { mode: "pay"; status: string } | { mode: "thanks"; saleId: string };

let phase: CustomerPhase = { mode: "selling" };
const listeners = new Set<() => void>();

export function setCustomerPhase(next: CustomerPhase) {
  if (JSON.stringify(phase) === JSON.stringify(next)) return;
  phase = next;
  for (const listener of listeners) listener();
}

export function useCustomerPhase(): CustomerPhase {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => phase,
    () => phase,
  );
}

/** True when a second display is attached, false when the plugin reports none. */
export async function detectCustomerDisplay(): Promise<boolean> {
  try {
    const info = await plugin.getInfo();
    return Boolean(info?.available && info.count > 0);
  } catch {
    return false;
  }
}

let lastPayload = "";

export async function pushCustomerDisplay(payload: CustomerPayload, enabled: boolean): Promise<void> {
  try {
    if (!enabled) {
      lastPayload = "";
      await plugin.setEnabled({ enabled: false });
      return;
    }
    const info = await plugin.getInfo();
    if (!info?.available) return;
    const body = JSON.stringify(payload);
    if (body === lastPayload) return;
    lastPayload = body;
    await plugin.setEnabled({ enabled: true });
    await plugin.update({ payload: body });
  } catch {
    // Single-screen phones and browsers have no Presentation display.
  }
}
