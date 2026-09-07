import { describe, expect, it } from "vitest";
import type { DivisionEntry } from "@/lib/division/types";
import { buildRoundRobin, circleRounds, isRoundRobinShape } from "./build";

/** seed 0..n-1 のエントリーを n 件作る。id は e1..en。 */
const entriesOf = (count: number): DivisionEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  }));

/** 組を "a-b"（小さい添字が先）の文字列にして比較しやすくする。 */
const pairKey = ([left, right]: [number, number]): string =>
  left < right ? `${left}-${right}` : `${right}-${left}`;

describe("circleRounds", () => {
  it("2 人未満は組を作らない", () => {
    expect(circleRounds(0)).toEqual([]);
    expect(circleRounds(1)).toEqual([]);
  });

  it("2 人は 1 節 1 試合", () => {
    expect(circleRounds(2)).toEqual([[[0, 1]]]);
  });

  it("偶数人は n-1 節で、各節に全員が 1 回ずつ出る", () => {
    const rounds = circleRounds(4);
    expect(rounds).toHaveLength(3);
    for (const pairs of rounds) {
      expect(pairs).toHaveLength(2);
      expect(pairs.flat().sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it("偶数人の割り当ては固定席と回転から決まる", () => {
    // 設計書の 4 人の例。回転の向きを変えると割り当てが変わるので固定する。
    expect(circleRounds(4)).toEqual([
      [
        [0, 3],
        [1, 2],
      ],
      [
        [0, 2],
        [3, 1],
      ],
      [
        [0, 1],
        [2, 3],
      ],
    ]);
  });

  it("奇数人は n 節で、各節にちょうど 1 人が休む", () => {
    const rounds = circleRounds(5);
    expect(rounds).toHaveLength(5);
    for (const pairs of rounds) {
      // 5 人なら 2 試合 = 4 人ぶんで、残り 1 人が休み。
      expect(pairs).toHaveLength(2);
      expect(new Set(pairs.flat()).size).toBe(4);
    }
  });

  it("奇数人でも架空の 1 人は組に現れない", () => {
    for (const pair of circleRounds(5).flat()) {
      expect(pair[0]).toBeLessThan(5);
      expect(pair[1]).toBeLessThan(5);
    }
  });

  it("全ペアがちょうど 1 回ずつ現れる", () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const keys = circleRounds(count).flat().map(pairKey);
      expect(keys).toHaveLength((count * (count - 1)) / 2);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("同じ節に同じ人が 2 回出ない", () => {
    for (const count of [4, 5, 6, 7]) {
      for (const pairs of circleRounds(count)) {
        const seats = pairs.flat();
        expect(new Set(seats).size).toBe(seats.length);
      }
    }
  });
});

describe("buildRoundRobin", () => {
  it("2 人未満は空の組み合わせを返す", () => {
    expect(buildRoundRobin(entriesOf(1))).toEqual({ version: 1, matches: [] });
    expect(buildRoundRobin([])).toEqual({ version: 1, matches: [] });
  });

  it("試合数は n(n-1)/2 になる", () => {
    expect(buildRoundRobin(entriesOf(4)).matches).toHaveLength(6);
    expect(buildRoundRobin(entriesOf(5)).matches).toHaveLength(10);
  });

  it("round は節番号、order は節内の位置、id は r{節}-{位置}", () => {
    const { matches } = buildRoundRobin(entriesOf(4));
    expect(matches.map((match) => match.id)).toEqual([
      "r1-0",
      "r1-1",
      "r2-0",
      "r2-1",
      "r3-0",
      "r3-1",
    ]);
    expect(matches[2].round).toBe(2);
    expect(matches[2].order).toBe(0);
  });

  it("matchNumber は全節を通した連番", () => {
    expect(
      buildRoundRobin(entriesOf(4)).matches.map((match) => match.matchNumber),
    ).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("スロットは両方とも entry で、bracket は winners 固定", () => {
    for (const match of buildRoundRobin(entriesOf(5)).matches) {
      expect(match.bracket).toBe("winners");
      expect(match.slots[0].kind).toBe("entry");
      expect(match.slots[1].kind).toBe("entry");
    }
  });

  it("シード順で組む。配列の並びではなく seed を見る", () => {
    // 逆順に渡しても seed 昇順で組むので、結果は entriesOf(4) と同じになる。
    const reversed = [...entriesOf(4)].reverse();
    expect(buildRoundRobin(reversed)).toEqual(buildRoundRobin(entriesOf(4)));
  });

  it("設計書の 4 人の例どおりに組む", () => {
    const cards = buildRoundRobin(entriesOf(4)).matches.map((match) =>
      match.slots.map((slot) =>
        slot.kind === "entry" ? slot.entryId : slot.kind,
      ),
    );
    expect(cards).toEqual([
      ["e1", "e4"],
      ["e2", "e3"],
      ["e1", "e3"],
      ["e4", "e2"],
      ["e1", "e2"],
      ["e3", "e4"],
    ]);
  });

  it("奇数人の休みは試合として保存しない", () => {
    // 5 人なら 5 節 10 試合。BYE スロットは 1 つも出ない。
    const { matches } = buildRoundRobin(entriesOf(5));
    expect(matches).toHaveLength(10);
    expect(
      matches.some((match) => match.slots.some((slot) => slot.kind === "bye")),
    ).toBe(false);
  });

  it("同じ入力からは同じ id が出る", () => {
    expect(buildRoundRobin(entriesOf(6))).toEqual(
      buildRoundRobin(entriesOf(6)),
    );
  });
});

describe("isRoundRobinShape", () => {
  it("全スロットが entry なら true", () => {
    expect(isRoundRobinShape(buildRoundRobin(entriesOf(4)))).toBe(true);
  });

  it("空の組み合わせは true（まだ作っていないだけ）", () => {
    expect(isRoundRobinShape({ version: 1, matches: [] })).toBe(true);
  });

  it("winnerOf を含むトーナメントの木は false", () => {
    expect(
      isRoundRobinShape({
        version: 1,
        matches: [
          {
            id: "m2-0",
            bracket: "winners",
            round: 2,
            order: 0,
            sequence: 0,
            matchNumber: "3",
            slots: [
              { kind: "winnerOf", matchId: "m1-0" },
              { kind: "winnerOf", matchId: "m1-1" },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("bye を含む木も false", () => {
    expect(
      isRoundRobinShape({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            sequence: 0,
            matchNumber: "1",
            slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
          },
        ],
      }),
    ).toBe(false);
  });
});
