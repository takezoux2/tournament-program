import type {
  BracketMatch,
  DivisionEntry,
  MatchingConfig,
} from "@/lib/division/types";

/**
 * 円卓法（サークル法）の節ごとの組を返す。数値は「seed 昇順に並べた
 * エントリー配列の添字」で、エントリー id ではない。
 *
 * 先頭の席を固定し、残りを 1 つずつ回転させながら向かい合う席と組む。
 * 奇数人のときは架空の 1 人を末尾（添字 count）に足して偶数にし、
 * その相手に当たった人はその節を休む（＝その組は返さない）。
 * この作り方だと全ペアがちょうど 1 回ずつ現れ、同じ節に同じ人が
 * 2 回出ないことが構造的に保証される。
 *
 * 2 人未満は対戦が成立しないので空を返す。
 */
export const circleRounds = (count: number): [number, number][][] => {
  if (count < 2) {
    return [];
  }

  // 奇数なら架空の 1 人を足す。添字 count がその 1 人で、実在しない。
  const size = count % 2 === 0 ? count : count + 1;
  const rotating = Array.from({ length: size - 1 }, (_, index) => index + 1);
  const rounds: [number, number][][] = [];

  for (let round = 0; round < size - 1; round += 1) {
    // 右へ round 回転させた並び。固定席 0 と合わせて 1 節ぶんの席順になる。
    const seats = [
      0,
      ...rotating.map(
        (_, index) =>
          rotating[(index - round + rotating.length) % rotating.length],
      ),
    ];

    const pairs: [number, number][] = [];
    for (let index = 0; index < size / 2; index += 1) {
      const left = seats[index];
      const right = seats[size - 1 - index];
      // 架空の 1 人が入る組は試合にしない。保存すると大会の進行順画面に
      // 実在しない試合の行が出てしまう。
      if (left < count && right < count) {
        pairs.push([left, right]);
      }
    }
    rounds.push(pairs);
  }

  return rounds;
};

/**
 * 試合 id。生成時の通し番号だけから決まる。接頭辞を single-elimination の
 * `m{round}-{order}` と変えてあるのは、形式を取り違えたデータが混ざったときに
 * 見分けられるようにするため。`r1-` の 1 は「リーグに節は無い（round は常に 1）」
 * ことを表していて、実施順ではない。並べ替えても id は変わらない。
 */
const matchId = (order: number): string => `r1-${order}`;

/**
 * エントリーのシード順から総当たりの組み合わせを組み立てる。
 * 2 人未満なら空を返す。呼び出し側はそれを「作れなかった」と読める。
 *
 * 円卓法で節ごとの組を作り、それを上から連結して 1 本の並びにする。
 * 節はここで消費されて保存されない（リーグに節を分ける必要が無いため）が、
 * 節の順に連結することで「同じ人が続けて試合をしにくい並び」が既定になる。
 */
export const buildRoundRobin = (entries: DivisionEntry[]): MatchingConfig => {
  const sorted = [...entries].sort((left, right) => left.seed - right.seed);
  const matches: BracketMatch[] = [];

  for (const pairs of circleRounds(sorted.length)) {
    for (const [left, right] of pairs) {
      const order = matches.length;
      matches.push({
        id: matchId(order),
        bracket: "winners",
        round: 1,
        order,
        sequence: order,
        matchName: String(order + 1),
        slots: [
          { kind: "entry", entryId: sorted[left].id },
          { kind: "entry", entryId: sorted[right].id },
        ],
      });
    }
  }

  return { version: 1, matches };
};

/**
 * 保存されている組み合わせがリーグの形をしているか。
 *
 * 部門の編集画面（/edit）は format を無条件に書き換えられるため、
 * トーナメントで組んだ木を持ったまま ROUND_ROBIN になった部門が存在しうる。
 * その木は winnerOf や bye を含むので、全スロットが entry かどうかで見分けられる。
 * 空の組み合わせは「まだ作っていない」であって形が違うわけではないので true。
 */
export const isRoundRobinShape = (config: MatchingConfig): boolean =>
  config.matches.every((match) =>
    match.slots.every((slot) => slot.kind === "entry"),
  );
