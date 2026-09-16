import type { MatchScoreEntry, ScoreAggregation } from "./types";

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

/**
 * 1 試合ぶんのスコアの要約（"21 - 20"）。運営の結果画面と公開の試合一覧で使う。
 *
 * 並びはスロットの順に揃える。scores の並びは保存時の送信順で、表示の
 * 「左の人 - 右の人」と一致する保証が無いため。両者とも値があるときだけ出す。
 * 片側だけの数字は対戦の要約として読めない。
 */
export const formatMatchScoreSummary = (
  /** スロット順の DivisionEntry.id。未確定のスロットは null */
  slotEntryIds: readonly (string | null)[],
  scores: readonly MatchScoreEntry[],
  aggregation: ScoreAggregation,
): string | null => {
  const formatted = slotEntryIds.map((entryId) =>
    entryId === null
      ? null
      : formatScore(
          aggregateScore(
            scores.find((entry) => entry.entryId === entryId)?.values ?? [],
            aggregation,
          ),
        ),
  );
  return formatted.length === 2 && formatted.every((value) => value !== null)
    ? formatted.join(" - ")
    : null;
};
