/** ノードの実寸。MatchCard の style にも同じ値を使い、計算と描画をずらさない。 */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;
export const GAP_X = 80;
export const GAP_Y = 24;

export type Position = { x: number; y: number };

/** layoutBracket が必要とする最小限の形。ResolvedMatch はこれに代入可能。 */
export type LayoutInput = {
  id: string;
  round: number;
  order: number;
  sourceMatchIds: [string | null, string | null];
};

/**
 * x はラウンド番号、y は供給元試合の中点で決める。
 * ラウンド昇順に走査するので、供給元の座標は必ず先に確定している。
 */
export function layoutBracket(matches: LayoutInput[]): Map<string, Position> {
  const ordered = [...matches].sort(
    (a, b) => a.round - b.round || a.order - b.order,
  );
  const positions = new Map<string, Position>();

  for (const match of ordered) {
    const sourceYs = match.sourceMatchIds
      .filter((id): id is string => id !== null)
      .map((id) => {
        const source = positions.get(id);
        if (!source) {
          throw new Error(
            `Match "${match.id}" references "${id}", which has no position yet`,
          );
        }
        return source.y;
      });

    const y =
      sourceYs.length > 0
        ? sourceYs.reduce((sum, value) => sum + value, 0) / sourceYs.length
        : match.order * (NODE_HEIGHT + GAP_Y);

    positions.set(match.id, { x: (match.round - 1) * (NODE_WIDTH + GAP_X), y });
  }

  return positions;
}
