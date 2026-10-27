export type KeyedLine = { key: string };

export function removeForUndo<T extends KeyedLine>(lines: T[], key: string): { lines: T[]; removed: T | null; index: number } {
  const index = lines.findIndex((line) => line.key === key);
  if (index < 0) return { lines, removed: null, index: -1 };
  return { lines: lines.filter((line) => line.key !== key), removed: lines[index], index };
}

export function undoRemove<T>(lines: T[], removed: T, index: number): T[] {
  const next = lines.slice();
  const at = Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, removed);
  return next;
}

export function optimisticApply<T>(
  previous: T,
  result: { ok: true; next: T } | { ok: false; message: string },
): { value: T; rolledBack: boolean; toast: string | null } {
  if (!result.ok) return { value: previous, rolledBack: true, toast: result.message };
  return { value: result.next, rolledBack: false, toast: null };
}
