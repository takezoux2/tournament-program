import type { DivisionEntry, SlotSource } from "@/lib/division/types";
import { seedOrder } from "./build";

/**
 * 人数を 2 の冪へ切り上げる。2 人未満は試合が成立しないので 0 を返す。
 */
const bracketSize = (count: number): number => {
  if (count < 2) {
    return 0;
  }
  let size = 2;
  while (size < count) {
    size *= 2;
  }
  return size;
};

/**
 * シード順のエントリーから 1 回戦のスロット割当を作る。
 * 余った位置は bye になる。標準シード順の性質から、bye は自動的に
 * 上位シードの相手側へ寄る（＝強い人が不戦勝を得る）。
 */
export const generateSlots = (entries: DivisionEntry[]): SlotSource[] => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const size = bracketSize(sorted.length);
  if (size === 0) {
    return [];
  }

  return seedOrder(size).map((position): SlotSource => {
    const entry = sorted[position - 1];
    return entry === undefined
      ? { kind: "bye" }
      : { kind: "entry", entryId: entry.id };
  });
};

/**
 * エントリーを 1 人ぶん置く。末尾に一番近い bye を置き換える。
 *
 * bye が 1 つも無いときは各スロットを [中身, bye] に開いて 1 段拡張してから置く。
 * こうすると既存の対戦カードは 2 回戦としてそのまま残り、新しい人だけが
 * 1 回戦を戦う形になる。9 人目が来たら予選が 1 試合生える、という運営の実感に合う。
 *
 * slots が空（組み合わせ未作成）のときは何もしない。
 */
export const placeEntry = (
  slots: SlotSource[],
  entryId: string,
): SlotSource[] => {
  if (slots.length === 0) {
    return [];
  }

  const next = slots.some((slot) => slot.kind === "bye")
    ? [...slots]
    : slots.flatMap((slot): SlotSource[] => [slot, { kind: "bye" }]);

  // 末尾から探す。「一番下の bye を埋める」がこの操作の定義そのもの。
  // 拡張した直後は末尾が必ず bye なので、拡張経路でも必ず見つかる。
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].kind === "bye") {
      next[index] = { kind: "entry", entryId };
      return next;
    }
  }

  return next;
};
