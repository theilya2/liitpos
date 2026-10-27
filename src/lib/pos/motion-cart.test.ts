import assert from "node:assert/strict";
import test from "node:test";
import { optimisticApply, removeForUndo, undoRemove } from "@/lib/pos/motion-cart.ts";

test("swipe delete can be undone back to the same place", () => {
  const lines = [
    { key: "a", name: "קולה" },
    { key: "b", name: "בורקס" },
    { key: "c", name: "מים" },
  ];
  const removed = removeForUndo(lines, "b");
  assert.deepEqual(removed.lines.map((line) => line.key), ["a", "c"]);
  assert.equal(removed.index, 1);
  assert.equal(removed.removed?.name, "בורקס");
  const restored = undoRemove(removed.lines, removed.removed!, removed.index);
  assert.deepEqual(restored.map((line) => line.key), ["a", "b", "c"]);
});

test("undo of a missing line leaves the cart unchanged", () => {
  const lines = [{ key: "a", name: "קולה" }];
  const removed = removeForUndo(lines, "missing");
  assert.equal(removed.removed, null);
  assert.equal(removed.lines, lines);
});

test("a failed add rolls the cart back and names the toast", () => {
  const previous = [{ key: "a", qty: 1 }];
  const failed = optimisticApply(previous, { ok: false, message: "קולה אזל מהמלאי." });
  assert.equal(failed.rolledBack, true);
  assert.equal(failed.value, previous);
  assert.equal(failed.toast, "קולה אזל מהמלאי.");
});

test("a successful add keeps the new cart and does not roll back", () => {
  const previous = [{ key: "a", qty: 1 }];
  const next = [{ key: "a", qty: 2 }];
  const applied = optimisticApply(previous, { ok: true, next });
  assert.equal(applied.rolledBack, false);
  assert.equal(applied.value, next);
  assert.equal(applied.toast, null);
});
