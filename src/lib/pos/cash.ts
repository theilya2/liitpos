import { roundMoney } from "@/lib/pos/money";
import type { CashMove } from "@/lib/pos/types";

export function openCashMoves(moves: CashMove[]): CashMove[] {
  return moves.filter((move) => !move.zId);
}

export function paidIn(moves: CashMove[]): number {
  return roundMoney(openCashMoves(moves).filter((move) => move.direction === "in").reduce((sum, move) => sum + move.amount, 0));
}

export function paidOut(moves: CashMove[]): number {
  return roundMoney(openCashMoves(moves).filter((move) => move.direction === "out").reduce((sum, move) => sum + move.amount, 0));
}

/** Opening float, plus cash sales, plus pay-ins, minus pay-outs. Moves already on a Z are skipped. */
export function drawerExpected(opening: number, cashTaken: number, moves: CashMove[]): number {
  return roundMoney(opening + cashTaken + paidIn(moves) - paidOut(moves));
}

export function drawerVariance(counted: number, expected: number): number {
  return roundMoney(counted - expected);
}
