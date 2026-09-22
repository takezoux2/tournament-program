import {
  GAP_X,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  type SectionLabel,
} from "./layout-bracket";

/** viewBox の四辺に足す余白 */
const VIEWBOX_PADDING = 16;
/** 試合名はカードの上に置くので、そのぶん上へ広げる */
export const MATCH_NAME_HEIGHT = 12;

export type ViewBox = { x: number; y: number; width: number; height: number };

/**
 * 静的 SVG の viewBox。layoutBracket の座標はカードの左上なので、
 * カードの大きさ・試合名・セクション見出しを含む外接矩形に余白を足す。
 * viewBox さえ正しければ、SVG は親の箱に合わせて縮むだけで用紙に収まる。
 */
export function bracketViewBox(
  positions: Iterable<Position>,
  labels: SectionLabel[] = [],
): ViewBox {
  const cards = [...positions];
  if (cards.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const left = Math.min(
    ...cards.map((p) => p.x),
    ...labels.map((l) => l.position.x),
  );
  const top = Math.min(
    ...cards.map((p) => p.y - MATCH_NAME_HEIGHT),
    ...labels.map((l) => l.position.y),
  );
  const right = Math.max(...cards.map((p) => p.x + NODE_WIDTH));
  const bottom = Math.max(...cards.map((p) => p.y + NODE_HEIGHT));
  return {
    x: left - VIEWBOX_PADDING,
    y: top - VIEWBOX_PADDING,
    width: right - left + VIEWBOX_PADDING * 2,
    height: bottom - top + VIEWBOX_PADDING * 2,
  };
}

/**
 * 供給元の試合から次の試合への連結線。供給元の右端中央を出て、次の試合の
 * 手前（GAP_X の半分）で縦に折れ、該当スロットの高さで左端に着く。
 * 折れ位置を次の試合の側に置くのは、ダブルイリミネーションの決勝のように
 * 列が離れた供給元でも、横に走る線が他のカードの上を通らないようにするため
 * （供給元の行は、その列より右にカードが無い）。
 */
export function connectorPath(
  source: Position,
  target: Position,
  slotIndex: 0 | 1,
): string {
  const startX = source.x + NODE_WIDTH;
  const startY = source.y + NODE_HEIGHT / 2;
  const bendX = target.x - GAP_X / 2;
  const endY = target.y + (NODE_HEIGHT / 4) * (slotIndex * 2 + 1);
  return `M ${startX} ${startY} H ${bendX} V ${endY} H ${target.x}`;
}
