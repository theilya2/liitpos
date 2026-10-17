import { isNativeApp, openExternal } from "@/lib/pos/native";

export type SmsMessage = {
  to: string;
  body: string;
  saleId: string;
};

/**
 * A sender opens the device composer or, later, posts to a paid provider.
 * Only the device sender is enabled.
 */
export type SmsProvider = {
  name: "device" | "server";
  send(message: SmsMessage): Promise<void>;
};

/** Reserved for a future server-side provider. Nothing calls this yet. */
export const SERVER_SMS_PATH = "/api/pos/sms";

type SmsWindow = Window & {
  LiitposNative?: { sendSms?: (number: string, body: string) => void };
};

function nativeSend(number: string, body: string): boolean {
  if (typeof window === "undefined") return false;
  const send = (window as SmsWindow).LiitposNative?.sendSms;
  if (!send) return false;
  send(number, body);
  return true;
}

export const deviceSmsProvider: SmsProvider = {
  name: "device",
  async send(message) {
    if (nativeSend(message.to, message.body)) return;
    const href = `sms:${message.to}?body=${encodeURIComponent(message.body)}`;
    if (isNativeApp()) {
      openExternal(href);
      return;
    }
    window.location.assign(href);
  },
};

export const serverSmsProvider: SmsProvider = {
  name: "server",
  async send() {
    throw new Error("ספק SMS לא הוגדר");
  },
};

export function activeSmsProvider(): SmsProvider {
  return deviceSmsProvider;
}

export function deliverSms(message: SmsMessage, provider: SmsProvider = activeSmsProvider()): Promise<void> {
  return provider.send(message);
}
