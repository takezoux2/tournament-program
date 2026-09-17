import { describe, expect, it } from "vitest";
import { downstreamMatchIds, resolveMatchSlots } from "./resolve";
import type { BracketMatch, DivisionResults, MatchingConfig } from "./types";

const match = (
  id: string,
  round: number,
  order: number,
  slots: BracketMatch["slots"],
): BracketMatch => ({
  id,
  bracket: "winners",
  round,
  order,
  matchName: id,
  slots,
});

/** e1 vs e2（1回戦）、e3 vs BYE（1回戦）、その勝者どうし（2回戦）。 */
const config: MatchingConfig = {
  version: 1,
  matches: [
    match("m1-0", 1, 0, [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]),
    match("m1-1", 1, 1, [{ kind: "entry", entryId: "e3" }, { kind: "bye" }]),
    match("m2-0", 2, 0, [
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]),
  ],
};

const results = (...matches: DivisionResults["matches"]): DivisionResults => ({
  version: 1,
  matches,
});

describe("resolveMatchSlots", () => {
  it("記録が無くても BYE の相手は勝ち上がる", () => {
    const resolved = resolveMatchSlots(config, results());

    expect(resolved.get("m1-0")).toEqual({
      slots: [
        { state: "entry", entryId: "e1" },
        { state: "entry", entryId: "e2" },
      ],
      winnerEntryId: null,
    });
    expect(resolved.get("m1-1")).toEqual({
      slots: [{ state: "entry", entryId: "e3" }, { state: "bye" }],
      winnerEntryId: "e3",
    });
  });

  it("記録された勝者を次のラウンドへ伝播する", () => {
    const resolved = resolveMatchSlots(
      config,
      results({ matchId: "m1-0", winnerEntryId: "e2" }),
    );

    expect(resolved.get("m2-0")).toEqual({
      slots: [
        { state: "entry", entryId: "e2" },
        { state: "entry", entryId: "e3" },
      ],
      winnerEntryId: null,
    });
  });

  it("前の試合が未記録なら次のラウンドのスロットは未確定", () => {
    const resolved = resolveMatchSlots(config, results());

    expect(resolved.get("m2-0")?.slots[0]).toEqual({ state: "pending" });
  });

  it("どちらのスロットにも立っていない勝者の記録は無視する", () => {
    // データが壊れていても読み出しでは落とさない（label.ts の
    // 「（不明な参加者）」と同じ思想）。
    const resolved = resolveMatchSlots(
      config,
      results({ matchId: "m1-0", winnerEntryId: "e9" }),
    );

    expect(resolved.get("m1-0")?.winnerEntryId).toBeNull();
    expect(resolved.get("m2-0")?.slots[0]).toEqual({ state: "pending" });
  });

  it("loserOf は勝者が決まってから敗者に解決する", () => {
    const withLoser: MatchingConfig = {
      version: 1,
      matches: [
        config.matches[0],
        match("mL", 2, 0, [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "entry", entryId: "e4" },
        ]),
      ],
    };

    expect(resolveMatchSlots(withLoser, results()).get("mL")?.slots[0]).toEqual(
      {
        state: "pending",
      },
    );
    expect(
      resolveMatchSlots(
        withLoser,
        results({ matchId: "m1-0", winnerEntryId: "e1" }),
      ).get("mL")?.slots[0],
    ).toEqual({ state: "entry", entryId: "e2" });
  });

  describe("BYE の伝播", () => {
    const byeConfig: MatchingConfig = {
      version: 1,
      matches: [
        match("m1-0", 1, 0, [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ]),
        match("m1-1", 1, 1, [
          { kind: "entry", entryId: "e3" },
          { kind: "bye" },
        ]),
        match("m1-2", 1, 2, [{ kind: "bye" }, { kind: "bye" }]),
        match("l1-0", 2, 0, [
          { kind: "loserOf", matchId: "m1-0" },
          { kind: "loserOf", matchId: "m1-1" },
        ]),
        match("m2-0", 2, 1, [
          { kind: "winnerOf", matchId: "m1-1" },
          { kind: "winnerOf", matchId: "m1-2" },
        ]),
        match("l1-1", 2, 2, [
          { kind: "loserOf", matchId: "m1-2" },
          { kind: "entry", entryId: "e4" },
        ]),
      ],
    };
    const noResults: DivisionResults = { version: 1, matches: [] };

    it("BYE を含む試合の敗者は bye になる", () => {
      const resolved = resolveMatchSlots(byeConfig, noResults);
      expect(resolved.get("l1-0")?.slots[1]).toEqual({ state: "bye" });
      expect(resolved.get("l1-1")?.slots[0]).toEqual({ state: "bye" });
    });

    it("BYE どうしの試合の勝者は bye になる", () => {
      const resolved = resolveMatchSlots(byeConfig, noResults);
      expect(resolved.get("m2-0")?.slots[1]).toEqual({ state: "bye" });
      // 相手が bye なので e3 が自動で勝ち上がる
      expect(resolved.get("m2-0")?.winnerEntryId).toBe("e3");
    });

    it("伝播した bye の相手は、相手が決まれば自動で勝ち上がる", () => {
      const resolved = resolveMatchSlots(byeConfig, {
        version: 1,
        matches: [{ matchId: "m1-0", winnerEntryId: "e1" }],
      });
      expect(resolved.get("l1-0")?.slots).toEqual([
        { state: "entry", entryId: "e2" },
        { state: "bye" },
      ]);
      expect(resolved.get("l1-0")?.winnerEntryId).toBe("e2");
      expect(resolved.get("l1-1")?.winnerEntryId).toBe("e4");
    });

    it("BYE 試合の相手が未確定でも敗者は bye と分かる", () => {
      const pendingConfig: MatchingConfig = {
        version: 1,
        matches: [
          ...byeConfig.matches.slice(0, 2),
          match("m2-0", 2, 0, [
            { kind: "winnerOf", matchId: "m1-0" },
            { kind: "bye" },
          ]),
          match("l2-0", 3, 0, [
            { kind: "loserOf", matchId: "m2-0" },
            { kind: "entry", entryId: "e4" },
          ]),
        ],
      };
      const resolved = resolveMatchSlots(pendingConfig, noResults);
      expect(resolved.get("l2-0")?.slots[0]).toEqual({ state: "bye" });
    });
  });
});

describe("downstreamMatchIds", () => {
  it("参照している試合を推移的に集める", () => {
    const deep: MatchingConfig = {
      version: 1,
      matches: [
        ...config.matches,
        match("m3-0", 3, 0, [
          { kind: "winnerOf", matchId: "m2-0" },
          { kind: "bye" },
        ]),
      ],
    };

    expect(downstreamMatchIds("m1-0", deep)).toEqual(new Set(["m2-0", "m3-0"]));
  });

  it("自分自身は含めない。参照されていなければ空", () => {
    expect(downstreamMatchIds("m2-0", config)).toEqual(new Set<string>());
  });
});
