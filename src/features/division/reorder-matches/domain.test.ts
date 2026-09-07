import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { reorderMatches } from "./domain";

const config: MatchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      sequence: 0,
      matchNumber: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
    {
      id: "m1-1",
      bracket: "winners",
      round: 1,
      order: 1,
      sequence: 1,
      matchNumber: "2",
      slots: [
        { kind: "entry", entryId: "e3" },
        { kind: "entry", entryId: "e4" },
      ],
    },
    {
      id: "m2-0",
      bracket: "winners",
      round: 2,
      order: 0,
      sequence: 2,
      matchNumber: "3",
      slots: [
        { kind: "winnerOf", matchId: "m1-0" },
        { kind: "winnerOf", matchId: "m1-1" },
      ],
    },
  ],
};

describe("reorderMatches", () => {
  it("指定の順に並べ、実施順を 0 から振り直す", () => {
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(next?.matches.map((match) => match.id)).toEqual([
      "m2-0",
      "m1-0",
      "m1-1",
    ]);
    expect(next?.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("試合番号を先頭から振り直す", () => {
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(next?.matches.map((match) => match.matchNumber)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("id・ブラケット上の位置・対戦カードは変えない", () => {
    // ここが変わるとブラケットの絵が崩れ、results と ScheduleItem の
    // 参照も外れる。並べ替えが触ってよいのは実施順と試合番号だけ。
    const next = reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);
    const moved = next?.matches[0];

    expect(moved?.id).toBe("m2-0");
    expect(moved?.round).toBe(2);
    expect(moved?.order).toBe(0);
    expect(moved?.bracket).toBe("winners");
    expect(moved?.slots).toEqual(config.matches[2].slots);
  });

  it("元の組み合わせを書き換えない", () => {
    reorderMatches(config, ["m2-0", "m1-0", "m1-1"]);

    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
    expect(config.matches[2].sequence).toBe(2);
  });

  it("件数が足りなければ null", () => {
    expect(reorderMatches(config, ["m1-0", "m1-1"])).toBeNull();
  });

  it("同じ id が 2 回来たら null", () => {
    // 件数だけ見ていると通ってしまい、片方の試合が消えた組み合わせを書く。
    expect(reorderMatches(config, ["m1-0", "m1-0", "m1-1"])).toBeNull();
  });

  it("知らない id が混じっていたら null", () => {
    expect(reorderMatches(config, ["m1-0", "m1-1", "m9-9"])).toBeNull();
  });

  it("組み合わせが空で並びも空なら空を返す", () => {
    expect(reorderMatches({ version: 1, matches: [] }, [])).toEqual({
      version: 1,
      matches: [],
    });
  });
});
