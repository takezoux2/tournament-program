export type ReorderDirection = "up" | "down";

export type OrderedDivision = {
  id: string;
  order: number;
};

/** 入れ替える 2 件。order の値をこの 2 件のあいだで交換する。 */
export type DivisionSwapPair = {
  target: OrderedDivision;
  neighbor: OrderedDivision;
};

/**
 * 動かしたい部門と向きから、order を交換する相手を決める。
 *
 * 削除で order に欠番ができるため、order の値を ±1 して相手を探す形にはしない。
 * order 昇順に並べたうえで「隣の要素」を index で取り、その order 値どうしを
 * 交換する。端（先頭の up / 末尾の down）と未知の id は null を返す。
 */
export const findSwapPair = (
  divisions: OrderedDivision[],
  divisionId: string,
  direction: ReorderDirection,
): DivisionSwapPair | null => {
  const sorted = [...divisions].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((division) => division.id === divisionId);
  if (index === -1) {
    return null;
  }

  const target = sorted[index];
  const neighbor = sorted[direction === "up" ? index - 1 : index + 1];
  if (!neighbor) {
    return null;
  }

  return { target, neighbor };
};
