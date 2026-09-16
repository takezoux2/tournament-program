import { describe, expect, it } from "vitest";
import type {
  BracketMatch,
  DivisionEntries,
  MatchingConfig,
  SlotSource,
} from "@/lib/division/types";
import { validateMatchingConfig } from "@/lib/division/validate";
import { buildFromSlots, toSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";
import {
  buildDoubleElimination,
  type DoubleEliminationVariant,
  isDoubleEliminationShape,
} from "./build";

const entriesOf = (count: number): DivisionEntries => ({
  version: 1,
  entries: Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    participantId: `p${index + 1}`,
    seed: index,
  })),
});

const build = (count: number, variant: DoubleEliminationVariant) =>
  buildDoubleElimination(generateSlots(entriesOf(count).entries), variant);

const inBracket = (config: MatchingConfig, bracket: BracketMatch["bracket"]) =>
  config.matches.filter((match) => match.bracket === bracket);

const byId = (config: MatchingConfig, id: string): BracketMatch => {
  const found = config.matches.find((match) => match.id === id);
  if (!found) throw new Error(`no match ${id}`);
  return found;
};

/** 参照の回数を数える。「勝者／敗者がちょうど 1 回だけ送られる」の検査用。 */
const referenceCount = (
  config: MatchingConfig,
  kind: "winnerOf" | "loserOf",
  matchId: string,
): number =>
  config.matches
    .flatMap((match) => match.slots)
    .filter(
      (slot: SlotSource) => slot.kind === kind && slot.matchId === matchId,
    ).length;

describe("buildDoubleElimination", () => {
  it("エントリー 2 人以下は空を返す", () => {
    expect(build(2, "grandFinal")).toEqual({ version: 1, matches: [] });
    expect(build(2, "thirdPlace")).toEqual({ version: 1, matches: [] });
    expect(buildDoubleElimination([], "grandFinal")).toEqual({
      version: 1,
      matches: [],
    });
  });

  it.each([
    [3, 4],
    [4, 4],
    [5, 8],
    [8, 8],
    [16, 16],
  ])("%i 人（枠 %i）の試合数", (count, size) => {
    const grand = build(count, "grandFinal");
    expect(inBracket(grand, "winners")).toHaveLength(size - 1);
    expect(inBracket(grand, "losers")).toHaveLength(size - 2);
    expect(inBracket(grand, "final")).toHaveLength(1);

    const third = build(count, "thirdPlace");
    expect(inBracket(third, "winners")).toHaveLength(size - 1);
    expect(inBracket(third, "losers")).toHaveLength(size - 3);
    expect(inBracket(third, "final")).toHaveLength(0);
  });

  it("勝者側は buildFromSlots と同じ試合を先頭に持つ", () => {
    const slots = generateSlots(entriesOf(8).entries);
    const winners = buildFromSlots(slots).matches;
    expect(
      buildDoubleElimination(slots, "grandFinal").matches.slice(
        0,
        winners.length,
      ),
    ).toEqual(winners);
  });

  it.each([
    3, 4, 5, 8, 16,
  ])("%i 人で validateMatchingConfig を通る", (count) => {
    for (const variant of ["grandFinal", "thirdPlace"] as const) {
      expect(
        validateMatchingConfig(build(count, variant), entriesOf(count)),
      ).toEqual([]);
    }
  });

  it("試合番号と sequence は勝者側 → 敗者側 → 決勝の順の連番", () => {
    const config = build(8, "grandFinal");
    config.matches.forEach((match, index) => {
      expect(match.sequence).toBe(index);
      expect(match.matchNumber).toBe(String(index + 1));
    });
    const sides = config.matches.map((match) => match.bracket);
    expect(sides.indexOf("losers")).toBe(7);
    expect(sides.at(-1)).toBe("final");
  });

  it("grandFinal: 全試合の敗者と、決勝以外の全試合の勝者がちょうど 1 回ずつ送られる", () => {
    const config = build(16, "grandFinal");
    for (const match of config.matches) {
      if (match.bracket === "final") {
        expect(referenceCount(config, "winnerOf", match.id)).toBe(0);
        continue;
      }
      expect(referenceCount(config, "winnerOf", match.id)).toBe(1);
      expect(referenceCount(config, "loserOf", match.id)).toBe(
        match.bracket === "winners" ? 1 : 0,
      );
    }
  });

  it("thirdPlace: 勝者側決勝と敗者側決勝はどこにも送られない", () => {
    const config = build(16, "thirdPlace");
    const winnersFinal = byId(config, "m4-0");
    const losers = inBracket(config, "losers");
    const losersFinal = losers[losers.length - 1];
    for (const match of config.matches) {
      const terminal =
        match.id === winnersFinal.id || match.id === losersFinal.id;
      expect(referenceCount(config, "winnerOf", match.id)).toBe(
        terminal ? 0 : 1,
      );
      expect(referenceCount(config, "loserOf", match.id)).toBe(
        match.bracket === "winners" && !terminal ? 1 : 0,
      );
    }
  });

  it("round は全ブラケット通し（敗者側 L は L + 1、決勝は 2k）", () => {
    const config = build(8, "grandFinal");
    expect(byId(config, "l1-0").round).toBe(2);
    expect(byId(config, "l4-0").round).toBe(5);
    expect(byId(config, "f")).toMatchObject({
      bracket: "final",
      round: 6,
      order: 0,
      slots: [
        { kind: "winnerOf", matchId: "m3-0" },
        { kind: "winnerOf", matchId: "l4-0" },
      ],
    });
  });

  it("敗者側 1 ラウンド目は勝者側 1 回戦の敗者どうし", () => {
    const config = build(8, "grandFinal");
    expect(byId(config, "l1-1").slots).toEqual([
      { kind: "loserOf", matchId: "m1-2" },
      { kind: "loserOf", matchId: "m1-3" },
    ]);
  });

  it("合流ラウンドの敗者の並びは 逆順 → 正順 と交互になる", () => {
    const config = build(16, "grandFinal");
    // 勝者側 2 回戦の敗者（l2）は逆順
    expect(byId(config, "l2-0").slots).toEqual([
      { kind: "winnerOf", matchId: "l1-0" },
      { kind: "loserOf", matchId: "m2-3" },
    ]);
    expect(byId(config, "l2-3").slots[1]).toEqual({
      kind: "loserOf",
      matchId: "m2-0",
    });
    // 勝者側 3 回戦の敗者（l4）は正順
    expect(byId(config, "l4-0").slots).toEqual([
      { kind: "winnerOf", matchId: "l3-0" },
      { kind: "loserOf", matchId: "m3-0" },
    ]);
    // 内部ラウンド
    expect(byId(config, "l3-1").slots).toEqual([
      { kind: "winnerOf", matchId: "l2-2" },
      { kind: "winnerOf", matchId: "l2-3" },
    ]);
  });

  it("thirdPlace で 4 人なら敗者側は 1 試合（3 位決定戦）", () => {
    const config = build(4, "thirdPlace");
    expect(inBracket(config, "losers")).toEqual([
      expect.objectContaining({
        id: "l1-0",
        slots: [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ],
      }),
    ]);
  });
});

describe("isDoubleEliminationShape", () => {
  it("空の組み合わせは true", () => {
    expect(
      isDoubleEliminationShape({ version: 1, matches: [] }, "grandFinal"),
    ).toBe(true);
  });

  it("生成したものは同じバリアントで true、別バリアントで false", () => {
    const config = build(8, "grandFinal");
    expect(isDoubleEliminationShape(config, "grandFinal")).toBe(true);
    expect(isDoubleEliminationShape(config, "thirdPlace")).toBe(false);
  });

  it("試合番号や実施順を変えても true", () => {
    const config = build(8, "thirdPlace");
    const edited: MatchingConfig = {
      version: 1,
      matches: [...config.matches].reverse().map((match, index) => ({
        ...match,
        sequence: index,
        matchNumber: `A${index}`,
      })),
    };
    expect(isDoubleEliminationShape(edited, "thirdPlace")).toBe(true);
  });

  it("シングルエリミネーションの木は false", () => {
    const slots = generateSlots(entriesOf(8).entries);
    expect(isDoubleEliminationShape(buildFromSlots(slots), "grandFinal")).toBe(
      false,
    );
  });

  it("toSlots で勝者側 1 回戦を取り出せる", () => {
    const slots = generateSlots(entriesOf(6).entries);
    expect(toSlots(buildDoubleElimination(slots, "grandFinal"))).toEqual(slots);
  });
});
