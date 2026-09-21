import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
import { resolveMatchSlots } from "@/lib/division/resolve";
import type { MatchingConfig, SlotSource } from "@/lib/division/types";
import { validateMatchingConfig } from "@/lib/division/validate";
import {
  buildFromFirstRound,
  buildFromSlots,
  type FirstRoundPair,
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

const emptyPairs = (n: number): FirstRoundPair[] =>
  Array.from({ length: n }, () => [bye, bye]);
const w = (id: string) => ({ kind: "winnerOf" as const, matchId: id });

describe("buildFromFirstRound", () => {
  it("0 試合なら空", () => {
    expect(buildFromFirstRound([])).toEqual({ version: 1, matches: [] });
  });

  it("1 試合なら 1 回戦だけ（それが決勝）", () => {
    const config = buildFromFirstRound(emptyPairs(1));
    expect(config.matches.map((m) => m.id)).toEqual(["m1-0"]);
  });

  it("2 試合なら決勝が両方の勝者を受ける", () => {
    const config = buildFromFirstRound(emptyPairs(2));
    const final = config.matches.find((m) => m.id === "m2-0");
    expect(final?.slots).toEqual([w("m1-0"), w("m1-1")]);
    expect(config.matches).toHaveLength(3);
  });

  it("3 試合なら 1 試合目の勝者が 2 回戦で bye を得る", () => {
    const config = buildFromFirstRound(emptyPairs(3));
    const round2 = config.matches
      .filter((m) => m.round === 2)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.slots);
    expect(round2).toEqual([
      [w("m1-0"), bye],
      [w("m1-1"), w("m1-2")],
    ]);
  });

  it("5 試合なら bye を seedOrder で散らし、1 回戦は追加順のまま詰める", () => {
    const config = buildFromFirstRound(emptyPairs(5));
    const round2 = config.matches
      .filter((m) => m.round === 2)
      .sort((a, b) => a.order - b.order)
      .map((m) => m.slots);
    expect(round2).toEqual([
      [w("m1-0"), bye],
      [w("m1-1"), w("m1-2")],
      [w("m1-3"), bye],
      [w("m1-4"), bye],
    ]);
  });

  it("8 試合なら bye は生まれず 15 試合になる", () => {
    const config = buildFromFirstRound(emptyPairs(8));
    expect(config.matches).toHaveLength(15);
    const higher = config.matches.filter((m) => m.round >= 2);
    expect(
      higher.every((m) => m.slots.every((s) => s.kind === "winnerOf")),
    ).toBe(true);
  });

  it("1 回戦の中身と id は入力の順どおり", () => {
    const pairs: FirstRoundPair[] = [
      [{ kind: "entry", entryId: "a" }, bye],
      [bye, { kind: "entry", entryId: "b" }],
    ];
    const config = buildFromFirstRound(pairs);
    const round1 = config.matches.filter((m) => m.round === 1);
    expect(round1.map((m) => [m.id, m.order, m.slots])).toEqual([
      ["m1-0", 0, pairs[0]],
      ["m1-1", 1, pairs[1]],
    ]);
  });

  it("1〜64 試合のどれでも、bye どうしの 2 回戦が無く、検証と形状判定を通る", () => {
    for (let n = 1; n <= 64; n += 1) {
      const config = buildFromFirstRound(emptyPairs(n));
      const round2 = config.matches.filter((m) => m.round === 2);
      expect(round2.some((m) => m.slots.every((s) => s.kind === "bye"))).toBe(
        false,
      );
      expect(
        validateMatchingConfig(config, { version: 1, entries: [] }),
      ).toEqual([]);
      expect(isSingleEliminationShape(config)).toBe(true);
    }
  });
});

describe("isSingleEliminationShape（2 回戦以降の bye）", () => {
  it("2 回戦以降に bye があってもトーナメントの形とみなす", () => {
    expect(isSingleEliminationShape(buildFromFirstRound(emptyPairs(3)))).toBe(
      true,
    );
  });

  it("2 回戦以降に entry があれば形が違う", () => {
    const config = buildFromFirstRound(emptyPairs(2));
    const broken = {
      ...config,
      matches: config.matches.map((m) =>
        m.round === 2
          ? {
              ...m,
              slots: [
                { kind: "entry" as const, entryId: "x" },
                m.slots[1],
              ] as typeof m.slots,
            }
          : m,
      ),
    };
    expect(isSingleEliminationShape(broken)).toBe(false);
  });
});

describe("buildFromFirstRound の木を resolveMatchSlots で解決する", () => {
  it("2 回戦の [勝者, bye] は 1 回戦の勝者がそのまま立つ", () => {
    // N=3 → 2 回戦は m2-0 = [w(m1-0), bye]、m2-1 = [w(m1-1), w(m1-2)]。
    const config = buildFromFirstRound([
      [entry("a"), entry("b")],
      [entry("c"), bye],
      [entry("d"), bye],
    ]);
    expect(config.matches.find((m) => m.id === "m2-0")?.slots).toEqual([
      { kind: "winnerOf", matchId: "m1-0" },
      bye,
    ]);

    const before = resolveMatchSlots(config, { version: 1, matches: [] });
    expect(before.get("m2-0")?.slots[0]).toEqual({ state: "pending" });

    const resolved = resolveMatchSlots(config, {
      version: 1,
      matches: [{ matchId: "m1-0", winnerEntryId: "b" }],
    });
    expect(resolved.get("m2-0")).toEqual({
      slots: [{ state: "entry", entryId: "b" }, { state: "bye" }],
      winnerEntryId: "b",
    });
  });

  it("空の 1 回戦 [bye, bye] から来る 2 回戦のスロットは pending ではなく bye", () => {
    const config = buildFromFirstRound([
      [entry("a"), entry("b")],
      [bye, bye],
      [entry("c"), bye],
    ]);
    expect(config.matches.find((m) => m.id === "m2-1")?.slots).toEqual([
      { kind: "winnerOf", matchId: "m1-1" },
      { kind: "winnerOf", matchId: "m1-2" },
    ]);

    const resolved = resolveMatchSlots(config, { version: 1, matches: [] });
    expect(resolved.get("m2-1")).toEqual({
      slots: [{ state: "bye" }, { state: "entry", entryId: "c" }],
      winnerEntryId: "c",
    });
  });
});
