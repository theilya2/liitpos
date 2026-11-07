import assert from "node:assert/strict";
import test from "node:test";
import {
  HELD_OUTBOX_KEY,
  HISTORY_HOLD_KEY,
  LEGACY_CLOUD_ORIGIN,
  PRODUCTION_CLOUD_ORIGIN,
  historyHeld,
  planServerMove,
  posUrl,
} from "./cloud-origin.ts";

const sale = { id: "sale-1" };
const queued = { id: "sale:store-main:sale-1" };

test("android API calls use the standalone host", () => {
  assert.equal(posUrl("/api/pos/sync", PRODUCTION_CLOUD_ORIGIN), `${PRODUCTION_CLOUD_ORIGIN}/api/pos/sync`);
  assert.equal(posUrl("/api/pos/activation/request", PRODUCTION_CLOUD_ORIGIN), `${PRODUCTION_CLOUD_ORIGIN}/api/pos/activation/request`);
  assert.equal(posUrl("/api/pos/activation/poll", PRODUCTION_CLOUD_ORIGIN), `${PRODUCTION_CLOUD_ORIGIN}/api/pos/activation/poll`);
  assert.equal(posUrl("/api/pos/update", PRODUCTION_CLOUD_ORIGIN), `${PRODUCTION_CLOUD_ORIGIN}/api/pos/update`);
});

test("a saved custom origin is not rewritten", () => {
  const plan = planServerMove({
    native: true,
    savedOrigin: "https://registers.example.com/admin",
    movedTo: "",
    token: "keep-me",
    outbox: [queued],
    sales: [sale],
  });
  assert.equal(plan.moved, false);
  assert.equal(plan.origin, "https://registers.example.com");
  assert.equal(plan.token, "keep-me");
  assert.deepEqual(plan.outbox, [queued]);
  assert.deepEqual(plan.sales, [sale]);
});

test("leaving the legacy host drops the old token and parks the queue without dropping sales", () => {
  const plan = planServerMove({
    native: true,
    savedOrigin: LEGACY_CLOUD_ORIGIN,
    movedTo: "",
    token: "vercel-device-token",
    outbox: [queued],
    sales: [sale],
  });
  assert.equal(plan.moved, true);
  assert.equal(plan.origin, PRODUCTION_CLOUD_ORIGIN);
  assert.equal(plan.token, "");
  assert.deepEqual(plan.outbox, []);
  assert.deepEqual(plan.held, [queued]);
  assert.deepEqual(plan.sales, [sale]);
  assert.equal(plan.clearCursor, true);
  assert.equal(plan.holdHistory, true);
  assert.equal(plan.held[0]?.id, queued.id);
});

test("the move runs once", () => {
  const again = planServerMove({
    native: true,
    savedOrigin: PRODUCTION_CLOUD_ORIGIN,
    movedTo: PRODUCTION_CLOUD_ORIGIN,
    token: "new-server-token",
    outbox: [{ id: "sale-new" }],
    sales: [sale],
  });
  assert.equal(again.moved, false);
  assert.equal(again.token, "new-server-token");
  assert.deepEqual(again.outbox, [{ id: "sale-new" }]);
  assert.deepEqual(again.sales, [sale]);
});

test("a fresh native install is not treated as a migration", () => {
  const plan = planServerMove({
    native: true,
    savedOrigin: "",
    movedTo: "",
    token: "",
    outbox: [],
    sales: [],
  });
  assert.equal(plan.moved, false);
  assert.equal(plan.origin, PRODUCTION_CLOUD_ORIGIN);
  assert.equal(plan.holdHistory, false);
});

test("the website bundle is not retargeted", () => {
  const plan = planServerMove({
    native: false,
    savedOrigin: LEGACY_CLOUD_ORIGIN,
    movedTo: "",
    token: "browser",
    outbox: [queued],
    sales: [sale],
  });
  assert.equal(plan.moved, false);
  assert.equal(plan.origin, LEGACY_CLOUD_ORIGIN);
  assert.equal(plan.token, "browser");
});

test("history hold is local and does not exist until the move sets it", () => {
  const bag = new Map<string, string>();
  const previous = globalThis.window;
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => bag.get(key) ?? null,
        setItem: (key: string, value: string) => bag.set(key, value),
      },
    },
  });
  try {
    assert.equal(historyHeld(), false);
    bag.set(HISTORY_HOLD_KEY, "1");
    bag.set(HELD_OUTBOX_KEY, JSON.stringify([queued]));
    assert.equal(historyHeld(), true);
    assert.equal(JSON.parse(bag.get(HELD_OUTBOX_KEY) ?? "[]")[0].id, queued.id);
  } finally {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.assign(globalThis, { window: previous });
  }
});
