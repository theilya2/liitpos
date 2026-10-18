import assert from "node:assert/strict";
import test from "node:test";
import { drawerExpected, drawerVariance, paidIn, paidOut } from "@/lib/pos/cash.ts";
import type { CashMove } from "@/lib/pos/types.ts";

function move(direction: "in" | "out", amount: number, zId: string | null = null): CashMove {
  return { id: `${direction}-${amount}-${zId ?? "open"}`, at: "2026-01-01T00:00:00.000Z", direction, amount, reason: "בדיקה", by: "נועה", employeeId: "u1", zId };
}

test("drawer expected adds pay-ins, subtracts pay-outs, and ignores a closed shift", () => {
  const moves = [move("in", 50), move("out", 20), move("in", 100, "z1")];
  assert.equal(paidIn(moves), 50);
  assert.equal(paidOut(moves), 20);
  assert.equal(drawerExpected(300, 80, moves), 410);
  assert.equal(drawerVariance(400, 410), -10);
});
