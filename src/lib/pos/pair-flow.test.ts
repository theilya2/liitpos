import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSeeStore } from "./access.ts";
import { pairedBaselineUpload } from "./baseline.ts";
import { catalogDoc, settingsDoc, staffDoc } from "./docs.ts";
import { cloneSettings } from "./seed.ts";
import { ensureReady, usePos } from "./store.ts";

function freshDevice() {
  usePos.setState({
    seeded: false,
    sessionUserId: null,
    stores: [],
    staff: [],
    outbox: [],
    cloudCursor: null,
    gateStoreId: null,
    registerBusinessId: "",
    registerNo: null,
    registerName: "",
    registerRevoked: false,
    cart: [],
    sales: [],
    lastGoodSync: null,
    appliedReleaseAt: null,
    deviceId: "device-test",
  });
  ensureReady();
  const state = usePos.getState();
  state.replaceOutbox([settingsDoc("store-main", state.settings, "2026-10-18T09:00:00.000Z")]);
}

describe("paired register baseline", () => {
  it("delivers a new back-office business and its worker, and drops the demo seed", () => {
    freshDevice();
    const before = usePos.getState();
    assert.ok(before.stores.some((store) => store.id === "store-main"));
    assert.ok(before.staff.some((user) => user.id === "u-manager"));

    const businessId = "store-sample1";
    const settings = {
      ...cloneSettings(),
      businessName: "מאפיית הדגמה",
      ownerName: "דנה",
      taxId: "",
      address: "הרצל 1",
      phone: "",
      vatRate: 18,
      openingFloat: 0,
      code: "135790",
      logo: null,
    };
    const docs = [
      settingsDoc(businessId, settings, "2026-10-18T10:00:00.000Z"),
      catalogDoc(
        { id: businessId, categories: [{ id: "general", name: "כללי" }], products: [], members: [], nextReceipt: 1001, nextZ: 1, nextCredit: 1 },
        "2026-10-18T10:00:00.000Z",
      ),
      staffDoc({ id: "u_worker1", name: "מיכל", pin: "4321", role: "cashier", active: true, storeIds: [businessId] }, "2026-10-18T10:00:01.000Z"),
    ];
    usePos.getState().applyRemote(docs);
    assert.equal(usePos.getState().takePairedBaseline(docs, businessId), true);
    const known = new Set(docs.map((doc) => doc.id));
    const upload = pairedBaselineUpload(usePos.getState().stores, usePos.getState().staff, known, businessId, "2026-10-18T10:00:02.000Z");
    assert.deepEqual(upload, []);
    usePos.getState().adoptRegister({ number: 1, name: "ראשית", businessId });

    const state = usePos.getState();
    assert.equal(state.gateStoreId, businessId);
    assert.equal(state.settings.businessName, "מאפיית הדגמה");
    assert.equal(state.settings.code, "135790");
    assert.deepEqual(state.products.map((product) => product.id), []);
    assert.deepEqual(state.categories.map((category) => category.name), ["כללי"]);
    assert.equal(state.stores.some((store) => store.id === "store-main"), false);
    assert.equal(state.staff.some((user) => user.id === "u-manager"), false);
    assert.equal(state.outbox.some((doc) => doc.businessId === "store-main"), false);
    assert.equal(state.staff.filter((user) => canSeeStore(user, businessId)).map((user) => user.name).join(","), "מיכל");
    assert.equal(state.login("u_worker1", "4321"), true);
    state.lock();
    assert.equal(usePos.getState().gateStoreId, businessId);
    assert.equal(usePos.getState().sessionUserId, null);
    assert.equal(usePos.getState().login("u-manager", "1111"), false);
  });

  it("shows no workers when the back office has not added any", () => {
    freshDevice();
    const businessId = "store-emptycat";
    const settings = { ...cloneSettings(), businessName: "עסק בלי צוות", code: "246801", openingFloat: 0, logo: null };
    const docs = [settingsDoc(businessId, settings, "2026-10-18T10:00:00.000Z")];
    usePos.getState().applyRemote(docs);
    assert.equal(usePos.getState().takePairedBaseline(docs, businessId), true);
    usePos.getState().adoptRegister({ number: 2, name: "", businessId });
    const state = usePos.getState();
    assert.equal(state.settings.businessName, "עסק בלי צוות");
    assert.deepEqual(state.categories, []);
    assert.deepEqual(state.products, []);
    assert.deepEqual(
      state.staff.filter((user) => canSeeStore(user, businessId)),
      [],
    );
    assert.equal(state.login(state.staff[0]?.id ?? "u-manager", "1111"), false);
  });
});
