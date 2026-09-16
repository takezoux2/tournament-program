import type { ScoreAggregation } from "./types";

/**
 * 非 null の値だけで集計する。1 つも無ければ null。
 *
 * 未入力を 0 として扱わないのは、審判 3 人のうち 1 人ぶんしか入っていない
 * 状態で合計も平均も嘘になるため。入力途中の保存を許す以上、この区別は要る。
 */
export const aggregateScore = (
  values: readonly (number | null)[],
  aggregation: ScoreAggregation,
): number | null => {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  const total = present.reduce((sum, value) => sum + value, 0);
  return aggregation === "sum" ? total : total / present.length;
};

/**
 * 表示用の文字列。小数第 2 位で四捨五入し、末尾の不要な 0 を落とす。
 *
 * 丸めは表示の直前に 1 回だけ行う。集計の途中で丸めると誤差が積み上がるし、
 * 丸めずに String() へ渡すと 0.30000000000000004 が画面に出る。
 */
export const formatScore = (value: number | null): string | null =>
  value === null ? null : String(Math.round(value * 100) / 100);
