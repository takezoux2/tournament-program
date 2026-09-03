import type {
  BracketMatch,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";

/**
 * 標準シード順。size 個の位置それぞれに「何番シードが入るか」を 1 始まりで返す。
 * size = 8 なら [1, 8, 4, 5, 2, 7, 3, 6]。
 *
 * 1 → [1, 2] → [1, 4, 2, 3] → ... と、各段で「今の長さ + 1 - 自分」を隣に挿し込む。
 * この作り方だと上位シードどうしが最後まで当たらないことが構造的に保証される。
 */
export const seedOrder = (size: number): number[] => {
  if (size < 1) {
    return [];
  }
  let list = [1];
  while (list.length < size) {
    const length = list.length * 2;
    list = list.flatMap((seed) => [seed, length + 1 - seed]);
  }
  return list;
};

/**
 * 試合 id。round と order だけから決まるので、組み立て直しても同じ id になる。
 * winnerOf の参照も構造から再構築されるため、参照が壊れる経路が存在しない。
 */
const matchId = (round: number, order: number): string => `m${round}-${order}`;

/**
 * 次の 2 の冪を計算する。既に 2 の冪なら変わらない。
 */
const nextPowerOfTwo = (n: number): number => {
  if (n <= 1) return 1;
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
};

/**
 * 1 回戦のスロット割当から勝ち上がり木を組み立てる。
 * 入力 slots の長さが 2 の冪でない場合、自動的に { kind: "bye" } でパディングする。
 * これは、配列が括弧全体の唯一の情報源であり、短い配列は「試合が足りない」のではなく
 * 「bye スロットが不足している」という正規化の意図である。
 * 2 未満なら試合が作れないので空。
 */
export const buildFromSlots = (slots: SlotSource[]): MatchingConfig => {
  if (slots.length < 2) {
    return { version: 1, matches: [] };
  }

  // 次の 2 の冪までパディング
  const targetSize = nextPowerOfTwo(slots.length);
  const paddedSlots = [...slots];
  while (paddedSlots.length < targetSize) {
    paddedSlots.push({ kind: "bye" });
  }

  const matches: BracketMatch[] = [];

  for (let order = 0; order < paddedSlots.length / 2; order += 1) {
    matches.push({
      id: matchId(1, order),
      bracket: "winners",
      round: 1,
      order,
      slots: [paddedSlots[order * 2], paddedSlots[order * 2 + 1]],
    });
  }

  let previousCount = paddedSlots.length / 2;
  let round = 2;
  while (previousCount > 1) {
    const count = previousCount / 2;
    for (let order = 0; order < count; order += 1) {
      matches.push({
        id: matchId(round, order),
        bracket: "winners",
        round,
        order,
        slots: [
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2) },
          { kind: "winnerOf", matchId: matchId(round - 1, order * 2 + 1) },
        ],
      });
    }
    previousCount = count;
    round += 1;
  }

  return { version: 1, matches };
};

/**
 * 木から 1 回戦のスロット割当を取り出す。buildFromSlots の逆向き。
 * Json の配列順は当てにできないので order で並べ直す。
 */
export const toSlots = (config: MatchingConfig): SlotSource[] =>
  config.matches
    .filter((match) => match.round === 1)
    .sort((left, right) => left.order - right.order)
    .flatMap((match) => [match.slots[0], match.slots[1]]);
