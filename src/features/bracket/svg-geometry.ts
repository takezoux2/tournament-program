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

/**
 * viewBox の最小の幅・高さ。A4 横向きの本文相当（約 1032×650px）を安全側に
 * 丸めた値。3 試合程度の小さいトーナメント表は外接矩形も小さく、これを
 * そのまま viewBox にすると親の箱いっぱいまで拡大されて文字だけ大きく印刷
 * されてしまう。仕様上は縮小のみ許すため、拡大が起きないよう下限を設ける。
 */
const MIN_VIEWBOX_WIDTH = 1100;
const MIN_VIEWBOX_HEIGHT = 700;

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
 * viewBox の幅・高さを最小サイズまで広げる。x/y はそのままにして右・下だけ
 * 広げるので、内容は左上を基準にした実寸のまま描かれ、拡大縮小はされない。
 * 最小サイズ以上の viewBox（大きいトーナメント表）はそのまま返す。
 */
export function expandViewBoxToMinimum(box: ViewBox): ViewBox {
  return {
    x: box.x,
    y: box.y,
    width: Math.max(box.width, MIN_VIEWBOX_WIDTH),
    height: Math.max(box.height, MIN_VIEWBOX_HEIGHT),
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
