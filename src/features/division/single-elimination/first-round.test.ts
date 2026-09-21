import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { buildFromFirstRound, type FirstRoundPair } from "./build";
import {
  addFirstRoundMatch,
  carryMatchNames,
  firstRoundPairs,
  removeEntries,
  removeFirstRoundMatch,
  setFirstRoundSlot,
} from "./first-round";

const bye = { kind: "bye" } as const;
const entry = (id: string) => ({ kind: "entry" as const, entryId: id });

const threeMatches: FirstRoundPair[] = [
  [entry("a"), entry("b")],
  [entry("c"), bye],
  [entry("d"), entry("e")],
];

const rename = (
  config: MatchingConfig,
  id: string,
  name: string,
): MatchingConfig => ({
  ...config,
  matches: config.matches.map((m) =>
    m.id === id ? { ...m, matchName: name } : m,
  ),
});

const nameOf = (config: MatchingConfig, id: string) =>
  config.matches.find((m) => m.id === id)?.matchName;

describe("firstRoundPairs", () => {
  it("1 回戦を order 順に取り出す（Json の並びに依存しない）", () => {
    const config = buildFromFirstRound(threeMatches);
    const shuffled = { ...config, matches: [...config.matches].reverse() };
    expect(firstRoundPairs(shuffled)).toEqual(threeMatches);
  });
});

describe("addFirstRoundMatch", () => {
  it("空の組み合わせに 1 試合目を作る", () => {
    const config = addFirstRoundMatch({ version: 1, matches: [] });
    expect(firstRoundPairs(config)).toEqual([[bye, bye]]);
  });

  it("末尾に空の試合を足し、配線し直し、既存の試合名を残す", () => {
    const named = rename(
      buildFromFirstRound(threeMatches),
      "m1-1",
      "準々決勝A",
    );
    const config = addFirstRoundMatch(named);
    expect(firstRoundPairs(config)).toEqual([...threeMatches, [bye, bye]]);
    expect(nameOf(config, "m1-1")).toBe("準々決勝A");
    // 4 試合 → 2 回戦に bye が無くなる
    expect(
      config.matches
        .filter((m) => m.round === 2)
        .every((m) => m.slots.every((s) => s.kind === "winnerOf")),
    ).toBe(true);
  });
});

describe("removeFirstRoundMatch", () => {
  it("試合を消して詰め、消した試合のエントリーを返す", () => {
    const result = removeFirstRoundMatch(
      buildFromFirstRound(threeMatches),
      "m1-0",
    );
    expect(result?.removedEntryIds).toEqual(["a", "b"]);
    expect(result && firstRoundPairs(result.config)).toEqual([
      threeMatches[1],
      threeMatches[2],
    ]);
  });

  it("詰めた試合には、詰める前の同じ試合の名前を引き継ぐ", () => {
    let config = buildFromFirstRound(threeMatches);
    config = rename(config, "m1-0", "消える試合");
    config = rename(config, "m1-2", "最後の試合");
    const result = removeFirstRoundMatch(config, "m1-1");
    expect(result && nameOf(result.config, "m1-0")).toBe("消える試合");
    expect(result && nameOf(result.config, "m1-1")).toBe("最後の試合");
  });

  it("bye はエントリーとして返さない", () => {
    const result = removeFirstRoundMatch(
      buildFromFirstRound(threeMatches),
      "m1-1",
    );
    expect(result?.removedEntryIds).toEqual(["c"]);
  });

  it("最後の 1 試合を消すと空になる", () => {
    const result = removeFirstRoundMatch(
      buildFromFirstRound([[bye, bye]]),
      "m1-0",
    );
    expect(result?.config).toEqual({ version: 1, matches: [] });
  });

  it("1 回戦以外や存在しない id なら null", () => {
    const config = buildFromFirstRound(threeMatches);
    expect(removeFirstRoundMatch(config, "m2-0")).toBeNull();
    expect(removeFirstRoundMatch(config, "nope")).toBeNull();
  });
});

describe("setFirstRoundSlot", () => {
  it("指定スロットだけ差し替え、前の中身を返す", () => {
    const config = rename(buildFromFirstRound(threeMatches), "m1-2", "名前");
    const result = setFirstRoundSlot(config, "m1-2", 1, entry("z"));
    expect(result?.replaced).toEqual(entry("e"));
    expect(result && firstRoundPairs(result.config)[2]).toEqual([
      entry("d"),
      entry("z"),
    ]);
    expect(result && nameOf(result.config, "m1-2")).toBe("名前");
  });

  it("1 回戦以外や存在しない id なら null", () => {
    const config = buildFromFirstRound(threeMatches);
    expect(setFirstRoundSlot(config, "m2-0", 0, bye)).toBeNull();
    expect(setFirstRoundSlot(config, "nope", 0, bye)).toBeNull();
  });
});

describe("carryMatchNames", () => {
  it("同じ id の名前を引き継ぎ、無い id は既定のまま", () => {
    const previous = rename(
      buildFromFirstRound(threeMatches),
      "m2-1",
      "準決勝",
    );
    const next = buildFromFirstRound([...threeMatches, [bye, bye]]);
    const carried = carryMatchNames(previous, next);
    expect(nameOf(carried, "m2-1")).toBe("準決勝");
    expect(nameOf(carried, "m1-3")).toBe(
      next.matches.find((m) => m.id === "m1-3")?.matchName,
    );
  });
});

describe("removeEntries", () => {
  it("指定 id のエントリーを除く", () => {
    const entries = {
      version: 1 as const,
      entries: [
        { id: "a", participantId: "p1", seed: 0 },
        { id: "b", participantId: "p2", seed: 1 },
      ],
    };
    expect(removeEntries(entries, ["a"]).entries.map((e) => e.id)).toEqual([
      "b",
    ]);
  });
});
