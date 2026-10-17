import type { ClubMember } from "@/lib/pos/types";

/** Israeli mobile numbers only: 05X and seven more digits. */
const LOCAL = /^05\d{8}$/;

/**
 * Accepts 05X-XXXXXXX, 05XXXXXXXX, and the same number as +972 or 972.
 * Returns E.164 (`+9725XXXXXXXX`) or null when the number is not a mobile.
 */
export function normalizeIsraeliMobile(input: string): string | null {
  let digits = input.trim().replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00972")) digits = digits.slice(2);
  if (digits.startsWith("972")) {
    digits = digits.slice(3);
    if (!digits.startsWith("0")) digits = `0${digits}`;
  }
  if (!LOCAL.test(digits)) return null;
  return `+972${digits.slice(1)}`;
}

/** `+972521234567` → `052-1234567`. */
export function formatIsraeliMobile(e164: string): string {
  const local = e164.startsWith("+972") ? `0${e164.slice(4)}` : e164;
  if (!LOCAL.test(local)) return e164;
  return `${local.slice(0, 3)}-${local.slice(3)}`;
}

export function matchClubMember(members: ClubMember[], e164: string): ClubMember | null {
  for (const member of members) {
    if (member.active === false) continue;
    if (normalizeIsraeliMobile(member.phone) === e164) return member;
  }
  return null;
}
