import type { BracketMatch, MatchingConfig } from "@/lib/division/types";

/**
 * 指定の並びで実施順と試合名を振り直す。
 *
 * 書き換えるのは sequence と matchName だけで、id / round / order / slots は
 * そのまま写す。id を保つので、results（matchId で試合を指す）と
 * ScheduleItem（(divisionId, matchId) で指す）の参照は壊れない。
 * round / order を保つので、トーナメントのブラケットの絵も動かない。
 *
 * 送られた id の並びが現在の組み合わせとちょうど一致しない（件数違い・重複・
 * 未知の id）場合は null を返す。画面が古い（別の誰かが組み合わせを作り直した）
 * ときに起きるもので、部分的に書くと試合が消えた組み合わせになるため、
 * 呼び出し側が「何も書かずに読み直しを促す」に倒せるようにする。
 */
export const reorderMatches = (
  config: MatchingConfig,
  matchIds: string[],
): MatchingConfig | null => {
  if (matchIds.length !== config.matches.length) {
    return null;
  }
  if (new Set(matchIds).size !== matchIds.length) {
    return null;
  }

  const byId = new Map(config.matches.map((match) => [match.id, match]));
  const matches: BracketMatch[] = [];

  for (const [sequence, matchId] of matchIds.entries()) {
    const match = byId.get(matchId);
    if (match === undefined) {
      return null;
    }
    matches.push({ ...match, sequence, matchName: String(sequence + 1) });
  }

  return { version: 1, matches };
};
