import type { DivisionResults, MatchResultRecord } from "./types";

/**
 * 1 試合分の結果を反映した新しい results を返す。元の値は変更しない。
 * 同じ matchId が既にあれば位置を保ったまま上書きし、無ければ末尾に追加する。
 */
export const applyMatchResult = (
  results: DivisionResults,
  record: MatchResultRecord,
): DivisionResults => {
  const index = results.matches.findIndex(
    (existing) => existing.matchId === record.matchId,
  );
  const matches =
    index === -1
      ? [...results.matches, record]
      : results.matches.map((existing, i) => (i === index ? record : existing));
  return { version: 1, matches };
};

/**
 * 指定した試合の記録を取り除いた新しい results を返す。元の値は変更しない。
 * 勝者を変えたときに、その勝者が進む先（下流）の記録をまとめて消すために使う。
 */
export const clearResults = (
  results: DivisionResults,
  matchIds: ReadonlySet<string>,
): DivisionResults => ({
  version: 1,
  matches: results.matches.filter((record) => !matchIds.has(record.matchId)),
});
