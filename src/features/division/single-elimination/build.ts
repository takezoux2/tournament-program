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
 * startRound 以降の各ラウンドを、前ラウンドの勝者どうしを組ませて matches に積む。
 * previousCount は startRound の 1 つ前のラウンドの試合数。1 になるまで半分にしていく。
 * buildFromSlots（startRound 2）と buildFromFirstRound（startRound 3）で共通の規則。
 */
const appendHigherRounds = (
  matches: BracketMatch[],
  startRound: number,
  previousCount: number,
): void => {
  let count = previousCount;
  let round = startRound;
  while (count > 1) {
    const nextCount = count / 2;
    for (let order = 0; order < nextCount; order += 1) {
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
    count = nextCount;
    round += 1;
  }
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

  appendHigherRounds(matches, 2, paddedSlots.length / 2);

  return { version: 1, matches };
};

/** 1 回戦の 1 試合ぶんのスロット。 */
export type FirstRoundPair = [SlotSource, SlotSource];

/**
 * 1 回戦の試合の並びから勝ち上がり木を組み立てる。buildFromSlots と違い
 * 1 回戦を 2 の冪まで水増ししない。「試合を追加」したら、その 1 試合だけが増える。
 *
 * 2 回戦の入力位置を 2 の冪 P まで取り、seedOrder(P) でシード番号が N を超える
 * 位置を bye にする。seedOrder は k と P+1-k を対にするので、N > P/2 である限り
 * bye どうしの対は生まれない。残りの位置には 1 回戦の勝者を追加順に詰める
 * （1 回戦の見た目の並びを入れ替えないため）。
 * 3 回戦以降は buildFromSlots と同じ規則で組む。
 */
export const buildFromFirstRound = (
  pairs: readonly FirstRoundPair[],
): MatchingConfig => {
  if (pairs.length === 0) {
    return { version: 1, matches: [] };
  }

  const matches: BracketMatch[] = pairs.map((pair, order) => ({
    id: matchId(1, order),
    bracket: "winners",
    round: 1,
    order,
    matchName: DEFAULT_MATCH_NAME,
    slots: [pair[0], pair[1]],
  }));

  if (pairs.length === 1) {
    return { version: 1, matches };
  }

  const size = nextPowerOfTwo(pairs.length);
  let nextOrder = 0;
  const feeds = seedOrder(size).map((seed): SlotSource => {
    if (seed > pairs.length) {
      return { kind: "bye" };
    }
    const source: SlotSource = {
      kind: "winnerOf",
      matchId: matchId(1, nextOrder),
    };
    nextOrder += 1;
    return source;
  });

  for (let order = 0; order < size / 2; order += 1) {
    matches.push({
      id: matchId(2, order),
      bracket: "winners",
      round: 2,
      order,
      matchName: DEFAULT_MATCH_NAME,
      slots: [feeds[order * 2], feeds[order * 2 + 1]],
    });
  }

  appendHigherRounds(matches, 3, size / 2);

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
 *
 * buildFromFirstRound は 1 回戦が 2 の冪でないとき 2 回戦に bye を置く。
 * bye は league の星取表に現れない（league は 2 回戦以降を持たない）ので、
 * 許しても判別は崩れない。
 */
export const isSingleEliminationShape = (config: MatchingConfig): boolean => {
  const higherRounds = config.matches.filter((match) => match.round >= 2);
  if (higherRounds.length === 0) {
    return config.matches.length <= 1;
  }
  return higherRounds.every((match) =>
    match.slots.every(
      (slot) => slot.kind === "winnerOf" || slot.kind === "bye",
    ),
  );
};

/**
 * 木から 1 回戦のスロット割当を取り出す。buildFromSlots の逆向き。
 * Json の配列順は当てにできないので order で並べ直す。
 */
export const toSlots = (config: MatchingConfig): SlotSource[] =>
  config.matches
    .filter((match) => match.bracket === "winners" && match.round === 1)
    .sort((left, right) => left.order - right.order)
    .flatMap((match) => [match.slots[0], match.slots[1]]);
