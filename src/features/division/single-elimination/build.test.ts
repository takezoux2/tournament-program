import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
import type { MatchingConfig, SlotSource } from "@/lib/division/types";
import {
  buildFromSlots,
  isSingleEliminationShape,
  seedOrder,
  toSlots,
} from "./build";

const entry = (id: string): SlotSource => ({ kind: "entry", entryId: id });
const bye: SlotSource = { kind: "bye" };

describe("seedOrder", () => {
  it("size 1 は 1 番だけを返す", () => {
    expect(seedOrder(1)).toEqual([1]);
  });

  it("size 8 で標準シード順を返す", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("1 番と 2 番が決勝まで当たらない", () => {
    const order = seedOrder(16);
    // 1 番は前半、2 番は後半に入るのが標準シード配置の要件。
    expect(order.indexOf(1)).toBeLessThan(8);
    expect(order.indexOf(2)).toBeGreaterThanOrEqual(8);
  });

  it("size 0 は空配列を返す", () => {
    expect(seedOrder(0)).toEqual([]);
  });
});

describe("buildFromSlots", () => {
  it("2 スロットなら決勝 1 試合だけになる", () => {
    const config = buildFromSlots([entry("a"), entry("b")]);
    expect(config.matches).toEqual([
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: DEFAULT_MATCH_NAME,
        slots: [entry("a"), entry("b")],
      },
    ]);
  });

  it("8 スロットなら 4 + 2 + 1 の 7 試合になる", () => {
    const slots = ["a", "b", "c", "d", "e", "f", "g", "h"].map(entry);
    const config = buildFromSlots(slots);
    expect(config.matches).toHaveLength(7);
    expect(config.matches.filter((match) => match.round === 1)).toHaveLength(4);
    expect(config.matches.filter((match) => match.round === 2)).toHaveLength(2);
    expect(config.matches.filter((match) => match.round === 3)).toHaveLength(1);
  });

  it("2 回戦以降は前ラウンドの勝者を参照する", () => {
    const slots = ["a", "b", "c", "d"].map(entry);
    const config = buildFromSlots(slots);
    const second = config.matches.find((match) => match.id === "m2-0");
    expect(second?.slots).toEqual([
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]);
  });

  it("スロットが 2 未満なら試合を作らない", () => {
    expect(buildFromSlots([]).matches).toEqual([]);
    expect(buildFromSlots([entry("a")]).matches).toEqual([]);
  });

  it("6 スロットでも 8 スロット扱いで組み立てる (バイで埋める)", () => {
    const slots = ["a", "b", "c", "d", "e", "f"].map(entry);
    const config = buildFromSlots(slots);

    // 4 round-1 matches (6 entries + 2 byes), 2 round-2, 1 round-3
    expect(config.matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(config.matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(config.matches.filter((m) => m.round === 3)).toHaveLength(1);

    // Verify the last two round-1 matches have byes
    const r1Matches = config.matches
      .filter((m) => m.round === 1)
      .sort((a, b) => a.order - b.order);
    expect(r1Matches[3].slots[0]).toEqual(bye);
    expect(r1Matches[3].slots[1]).toEqual(bye);
  });

  it("5 スロット (奇数) でも 8 スロット扱いで組み立てる", () => {
    const slots = ["a", "b", "c", "d", "e"].map(entry);
    const config = buildFromSlots(slots);

    // All slots should be defined objects with a kind property
    for (const match of config.matches) {
      for (const slot of match.slots) {
        expect(slot).toBeDefined();
        expect(slot).toHaveProperty("kind");
      }
    }

    // Verify structure
    expect(config.matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(config.matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(config.matches.filter((m) => m.round === 3)).toHaveLength(1);
  });

  it("6 スロットの場合、全ての winnerOf 参照がマッチ id として存在する", () => {
    const slots = ["a", "b", "c", "d", "e", "f"].map(entry);
    const config = buildFromSlots(slots);

    const matchIds = new Set(config.matches.map((m) => m.id));

    for (const match of config.matches) {
      for (const slot of match.slots) {
        if (slot.kind === "winnerOf") {
          expect(matchIds.has(slot.matchId)).toBe(true);
        }
      }
    }
  });

  it("bye の試合を含む全試合に既定の試合名テンプレートを入れる", () => {
    const config = buildFromSlots([
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
      { kind: "entry", entryId: "e3" },
    ]);

    expect(config.matches.map((match) => match.matchName)).toEqual([
      DEFAULT_MATCH_NAME,
      DEFAULT_MATCH_NAME,
      DEFAULT_MATCH_NAME,
    ]);
  });

  it("試合に実施順（sequence）を持たせない", () => {
    const config = buildFromSlots([
      entry("e1"),
      entry("e2"),
      entry("e3"),
      entry("e4"),
    ]);

    for (const match of config.matches) {
      expect(match).not.toHaveProperty("sequence");
    }
  });
});

describe("toSlots", () => {
  it("buildFromSlots と往復して元に戻る", () => {
    const slots = [entry("a"), bye, entry("c"), entry("d")];
    expect(toSlots(buildFromSlots(slots))).toEqual(slots);
  });

  it("1 回戦を order 昇順に並べ直して取り出す", () => {
    // DB の Json は順序が保証されないため、order で並べ直せることを確かめる。
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [entry("c"), entry("d")],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [entry("a"), entry("b")],
        },
      ],
    };
    expect(toSlots(config)).toEqual([
      entry("a"),
      entry("b"),
      entry("c"),
      entry("d"),
    ]);
  });

  it("1 回戦が無ければ空配列を返す", () => {
    expect(toSlots({ version: 1, matches: [] })).toEqual([]);
  });
});

describe("isSingleEliminationShape", () => {
  it("組み立てたばかりの木は true", () => {
    const slots = ["a", "b", "c", "d"].map(entry);
    expect(isSingleEliminationShape(buildFromSlots(slots))).toBe(true);
  });

  it("空の組み合わせは true（まだ作っていないだけ）", () => {
    expect(isSingleEliminationShape({ version: 1, matches: [] })).toBe(true);
  });

  it("1 試合だけの組み合わせは両形式で区別が付かないので true", () => {
    const config = buildFromSlots([entry("a"), entry("b")]);
    expect(isSingleEliminationShape(config)).toBe(true);
  });

  it("全スロットが entry のリーグの星取表は false", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "r2-0",
          bracket: "winners",
          round: 2,
          order: 0,
          matchName: "2",
          slots: [entry("a"), entry("c")],
        },
      ],
    };
    expect(isSingleEliminationShape(config)).toBe(false);
  });

  it("2 回戦以降が winnerOf なら true", () => {
    const slots = ["a", "b", "c", "d"].map(entry);
    const config = buildFromSlots(slots);
    // 2 回戦（round 2）を持つ木であることを前提にしたテスト。
    expect(config.matches.some((match) => match.round === 2)).toBe(true);
    expect(isSingleEliminationShape(config)).toBe(true);
  });

  it("全試合が round 1 の複数試合（リーグの並び）は false", () => {
    // Task 3 でリーグの組み合わせは全試合が round 1 になった。「round >= 2 が
    // 無い」というだけで判定すると、2 試合以上あっても空配列の every が
    // 常に true を返してリーグの星取表を見分けられなくなる。試合数も
    // 見て、2 試合以上あれば round 1 だけの並びを false にする。
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "r1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [entry("a"), entry("b")],
        },
        {
          id: "r1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [entry("a"), entry("c")],
        },
      ],
    };
    expect(isSingleEliminationShape(config)).toBe(false);
  });
});
