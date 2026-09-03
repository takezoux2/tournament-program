import type { DivisionEntry } from "@/lib/division/types";

export type ReorderEntryDirection = "up" | "down";

/**
 * 隣のエントリーと入れ替えて seed を 0 から振り直す。
 * 端まで来ている / 対象が無い場合は null を返し、呼び出し側が
 * 「何も起きなかった」として扱えるようにする。
 *
 * 部門の並べ替え（features/division/reorder）と違って order の unique 制約が無いため、
 * 退避値を使う必要はなく、配列の入れ替えで済む。
 */
export const reorderEntries = (
  entries: DivisionEntry[],
  entryId: string,
  direction: ReorderEntryDirection,
): DivisionEntry[] | null => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const index = sorted.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return null;
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) {
    return null;
  }

  const next = [...sorted];
  next[index] = sorted[target];
  next[target] = sorted[index];

  return next.map((entry, seed) => ({ ...entry, seed }));
};
