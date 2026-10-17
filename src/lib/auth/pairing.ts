export type DeviceTokenView = {
  id: string;
  label: string;
  createdAt: string;
  lastSeen: string | null;
  revoked: boolean;
};

/** Deep link the Android app already accepts: liitpos://link?token=&cloud= */
export function pairingLink(token: string, cloud: string): string {
  const origin = cloud.trim().replace(/\/+$/, "");
  return `liitpos://link?token=${encodeURIComponent(token)}&cloud=${encodeURIComponent(origin)}`;
}

export function cleanDeviceLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.replace(/\s+/g, " ").trim();
  if (!label || label.length > 40) return null;
  return label;
}
