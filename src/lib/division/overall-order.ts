/**
 * 通し番号の対照表のキー。試合 id は部門の中でしか一意でないため、
 * 大会をまたぐ表では部門 id と組にする必要がある。
 */
export const overallSeqKey = (divisionId: string, matchId: string): string =>
  `${divisionId}:${matchId}`;

/**
 * 通し番号の材料になる部門。matchIds は部門の matches 配列の順
 * （parseMatchingConfig が bracket → round → order に揃えた順）で渡す。
 */
export type OverallOrderDivision = {
  id: string;
  /** 大会内での表示順。行を持たない試合を末尾へ足すときの並び順に使う。 */
  order: number;
  matchIds: string[];
};

/** 保存されている進行順の 1 行。区切りは呼び出し側で落として渡す。 */
export type OverallOrderItem = { divisionId: string; matchId: string };

/**
 * 大会の全試合に 1 始まりの通し番号を振る。
 *
 * 並びの規則は進行順の一覧（features/schedule の buildScheduleView）と同じ
 * ——「保存された進行順に並べ、実体の無い行と二重の行は落とし、行を持たない
 * 試合を部門 order → 部門内の配列の順で末尾に足す」。同じ規則を 2 箇所に書くと
 * 必ずずれるので、順序の決定はこの関数 1 つに集め、進行順の一覧もここから
 * 並びを得る。features どうしは依存できないため下位共通層に置いてある。
 *
 * 区切り行を数えないのは、区切りを 1 本挿すだけで以降の試合の番号が
 * 飛ぶのを避けるため。運営者が数えるのは試合であって区切りではない。
 */
export const buildOverallSeq = (
  divisions: readonly OverallOrderDivision[],
  savedItems: readonly OverallOrderItem[],
): Map<string, number> => {
  const known = new Set<string>();
  for (const division of divisions) {
    for (const matchId of division.matchIds) {
      known.add(overallSeqKey(division.id, matchId));
    }
  }

  const ordered: string[] = [];
  const placed = new Set<string>();

  for (const item of savedItems) {
    const key = overallSeqKey(item.divisionId, item.matchId);
    // 実体の無い行（組み合わせの作り直しで消えた試合）と二重の行は数えない。
    if (!known.has(key) || placed.has(key)) {
      continue;
    }
    placed.add(key);
    ordered.push(key);
  }

  for (const division of [...divisions].sort(
    (left, right) => left.order - right.order,
  )) {
    for (const matchId of division.matchIds) {
      const key = overallSeqKey(division.id, matchId);
      if (!placed.has(key)) {
        placed.add(key);
        ordered.push(key);
      }
    }
  }

  return new Map(ordered.map((key, index) => [key, index + 1]));
};
