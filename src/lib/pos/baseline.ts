import { isDemoBusiness } from "@/lib/pos/demo";
import { snapshotDocs, type CloudDoc } from "@/lib/pos/docs";
import type { Branch, StaffUser } from "@/lib/pos/types";

/** Staff seeded on a fresh install. They are not workers from the Back Office. */
export const SEED_STAFF_IDS = new Set(["u-manager", "u-shift", "u-cashier"]);

export function staffIdOf(doc: CloudDoc): string {
  return doc.kind === "staff" && doc.id.startsWith("staff:") ? doc.id.slice("staff:".length) : "";
}

/**
 * What a paired register may upload on its first sync.
 * The local demo shop and its sample workers never go up to the owner's cloud.
 */
export function pairedBaselineUpload(
  stores: Branch[],
  staff: StaffUser[],
  known: Set<string>,
  businessId: string,
  updatedAt: string,
): CloudDoc[] {
  if (!businessId) return [];
  const docs = snapshotDocs(
    stores.filter((branch) => branch.id === businessId && !isDemoBusiness(branch.id, branch.settings.code)),
    staff.filter((user) => !SEED_STAFF_IDS.has(user.id) && (user.storeIds.length === 0 || user.storeIds.includes(businessId))),
    updatedAt,
  );
  return docs.filter((doc) => !known.has(doc.id));
}

export function pruneDemoSeed(input: {
  stores: Branch[];
  staff: StaffUser[];
  docs: CloudDoc[];
  businessId: string;
}): { stores: Branch[]; staff: StaffUser[]; droppedBusinessIds: string[]; droppedStaffIds: string[] } {
  const remoteStaff = new Set(input.docs.filter((doc) => doc.kind === "staff" && !doc.deleted).map(staffIdOf).filter(Boolean));
  const remoteBusiness = new Set(
    input.docs.filter((doc) => !doc.deleted && (doc.kind === "settings" || doc.kind === "catalog") && doc.businessId).map((doc) => doc.businessId),
  );
  const stores = input.stores.filter((branch) => {
    if (branch.id === "store-empty") return false;
    if (input.businessId && branch.id === input.businessId) return true;
    if (isDemoBusiness(branch.id, branch.settings.code) && !remoteBusiness.has(branch.id)) return false;
    return true;
  });
  const staff = input.staff.filter((user) => remoteStaff.has(user.id) || !SEED_STAFF_IDS.has(user.id));
  return {
    stores,
    staff,
    droppedBusinessIds: input.stores.filter((branch) => !stores.some((next) => next.id === branch.id)).map((branch) => branch.id),
    droppedStaffIds: input.staff.filter((user) => !staff.some((next) => next.id === user.id)).map((user) => user.id),
  };
}

export function outboxWithoutDropped(outbox: CloudDoc[], droppedBusinessIds: string[], droppedStaffIds: string[]): CloudDoc[] {
  const businesses = new Set(droppedBusinessIds);
  const people = new Set(droppedStaffIds);
  return outbox.filter((doc) => {
    if (doc.kind === "staff" && people.has(staffIdOf(doc))) return false;
    if (doc.kind !== "staff" && businesses.has(doc.businessId)) return false;
    return true;
  });
}
