import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
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
      matchName: DEFAULT_MATCH_NAME,
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
        matchName: DEFAULT_MATCH_NAME,
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
 * 保存されている組み合わせがトーナメントの形をしているか。
 *
 * 部門の編集画面（/edit）は format を無条件に書き換えられるため、
 * リーグで組んだ星取表を持ったまま SINGLE_ELIMINATION になった部門が
 * 存在しうる。その星取表は全スロットが entry なので、2 回戦以降の
 * 全スロットが winnerOf かどうかで見分けられる。
 * 空の組み合わせは「まだ作っていない」であって形が違うわけではないので true。
 *
 * 1 試合だけの組み合わせ（1 回戦のみ）は両形式で区別が付かない。
 * 2 人の総当たりも 2 人のトーナメントも「1 試合だけ」という同じ形になり、
 * 同じサイズでは両者が同型（isomorphic）だから区別する意味も無い。
 *
 * リーグは Task 3 で全試合を round 1 として保存するようになったため、
 * 「2 回戦以降が無い」だけでは 3 人以上のリーグの星取表（round 1 の試合が
 * 複数ある）を見分けられない（フィルタが空になり every が空配列で
 * true になってしまう）。2 回戦以降が無いときは試合数も見て、1 試合を
 * 超えていれば false にする。
 */
export const isSingleEliminationShape = (config: MatchingConfig): boolean => {
  const higherRounds = config.matches.filter((match) => match.round >= 2);
  if (higherRounds.length === 0) {
    return config.matches.length <= 1;
  }
  return higherRounds.every((match) =>
    match.slots.every((slot) => slot.kind === "winnerOf"),
  );
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
