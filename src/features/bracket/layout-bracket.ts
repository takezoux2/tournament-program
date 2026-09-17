import type { BracketSide } from "./types";

/** ノードの実寸。MatchCard の style にも同じ値を使い、計算と描画をずらさない。 */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;
export const GAP_X = 80;
export const GAP_Y = 24;
/** 勝者側の最下端と敗者側の最上端のあいだ。ラベルが収まる高さにする。 */
export const SECTION_GAP = 72;
/** セクションラベルを、エリア最上端の試合からどれだけ上に置くか。 */
export const SECTION_LABEL_OFFSET = 28;

export type Position = { x: number; y: number };

/** layoutBracket が必要とする最小限の形。ResolvedMatch はこれに代入可能。 */
export type LayoutInput = {
  id: string;
  /** 省略時は winners */
  bracket?: BracketSide;
  round: number;
  order: number;
  sourceMatchIds: [string | null, string | null];
};

const SIDES: BracketSide[] = ["winners", "losers", "final"];
const sideOf = (match: LayoutInput): BracketSide => match.bracket ?? "winners";

/**
 * 勝者側 → 敗者側 → 決勝の順に座標を決める。
 *
 * - 勝者側: x はラウンド番号、y は供給元試合の中点（従来どおり）
 * - 敗者側: 勝者側の下に SECTION_GAP を空けて置く。round は全ブラケット通しの
 *   番号（敗者側 L は L + 1）なので、列は round − 2。sourceMatchIds は winnerOf
 *   だけなので、合流ラウンドは敗者側の前の試合と同じ高さに並ぶ
 * - 決勝: 両ブラケットの最終列の右。y は供給元（両決勝）の中点
 *
 * 各エリアをラウンド昇順に走査するので、供給元の座標は必ず先に確定している。
 */
export function layoutBracket(matches: LayoutInput[]): Map<string, Position> {
  const ordered = [...matches].sort(
    (a, b) =>
      SIDES.indexOf(sideOf(a)) - SIDES.indexOf(sideOf(b)) ||
      a.round - b.round ||
      a.order - b.order,
  );
  const positions = new Map<string, Position>();
  let losersTop: number | null = null;
  let lastColumn = -1;

  for (const match of ordered) {
    const side = sideOf(match);

    if (side === "losers" && losersTop === null) {
      const ys = [...positions.values()].map((position) => position.y);
      losersTop =
        ys.length > 0 ? Math.max(...ys) + NODE_HEIGHT + SECTION_GAP : 0;
    }

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

    const top = side === "losers" ? (losersTop ?? 0) : 0;
    const y =
      sourceYs.length > 0
        ? sourceYs.reduce((sum, value) => sum + value, 0) / sourceYs.length
        : top + match.order * (NODE_HEIGHT + GAP_Y);

    let column: number;
    if (side === "final") {
      column = lastColumn + 1;
    } else {
      column = side === "losers" ? match.round - 2 : match.round - 1;
      lastColumn = Math.max(lastColumn, column);
    }

    positions.set(match.id, { x: column * (NODE_WIDTH + GAP_X), y });
  }

  return positions;
}

export type SectionLabel = { id: string; label: string; position: Position };

const SECTION_TEXT: Record<BracketSide, string> = {
  winners: "勝者側",
  losers: "敗者側",
  final: "決勝",
};

/**
 * 各エリアの左上に置く見出し。勝者側しか無い（シングルエリミネーション）
 * ときは見出しが無くても読めるので出さない。
 */
export function sectionLabels(
  matches: LayoutInput[],
  positions: Map<string, Position>,
): SectionLabel[] {
  if (matches.every((match) => sideOf(match) === "winners")) {
    return [];
  }
  return SIDES.flatMap((side) => {
    const placed = matches
      .filter((match) => sideOf(match) === side)
      .map((match) => positions.get(match.id))
      .filter((position): position is Position => position !== undefined);
    if (placed.length === 0) {
      return [];
    }
    return [
      {
        id: `section-${side}`,
        label: SECTION_TEXT[side],
        position: {
          x: Math.min(...placed.map((position) => position.x)),
          y:
            Math.min(...placed.map((position) => position.y)) -
            SECTION_LABEL_OFFSET,
        },
      },
    ];
  });
}
