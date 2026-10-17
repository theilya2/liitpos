import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { userFromSession } from "./session-user.ts";
import { currentUser, ensureReady, usePos } from "../pos/store.ts";

const CAPACITOR_SESSION_BODY = "<!DOCTYPE html><html lang=\"he\"><body>קופהקל</body></html>";

describe("fresh install", () => {
  it("treats the Capacitor sign-in page as signed out instead of reading .id", () => {
    assert.equal(userFromSession(CAPACITOR_SESSION_BODY), null);
    assert.equal(userFromSession(null), null);
    assert.equal(userFromSession(undefined), null);
    assert.equal(userFromSession({}), null);
    assert.equal(userFromSession({ session: { id: "only-a-session" } }), null);
    assert.equal(userFromSession({ user: null, session: null }), null);
    assert.deepEqual(userFromSession({ user: { id: "owner-1", name: "Ilya", email: "ilya@example.com", image: null }, session: {} }), {
      id: "owner-1",
      name: "Ilya",
      email: "ilya@example.com",
      image: null,
    });
  });

  it("opens a blank device onto a register with staff, and nobody signed in", () => {
    usePos.setState({
      seeded: false,
      sessionUserId: null,
      stores: [],
      staff: [],
      outbox: [],
      cloudCursor: null,
      lastGoodSync: null,
      appliedReleaseAt: null,
      deviceId: "",
      gateStoreId: null,
      cart: [],
      sales: [],
      receiptToPrint: null,
      zToPrint: null,
    });
    ensureReady();
    const state = usePos.getState();
    assert.equal(currentUser(state), null);
    assert.equal(state.sessionUserId, null);
    assert.ok(state.stores.length > 0);
    for (const store of state.stores) {
      assert.equal(typeof store.id, "string");
      assert.match(store.settings.code, /^\d{6}$/);
    }
    for (const user of state.staff) {
      assert.equal(typeof user.id, "string");
      assert.equal(user.pin.length, 4);
    }
    const business = state.stores.find((store) => store.id === state.gateStoreId) ?? null;
    assert.equal(business, null);
  });
});
