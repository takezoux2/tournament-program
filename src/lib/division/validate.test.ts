import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "./match-name";
import type { DivisionEntries, DivisionResults, MatchingConfig } from "./types";
import {
  reachableEntryIds,
  validateEntries,
  validateMatchingConfig,
  validateResults,
} from "./validate";

const entries = (
  ...list: { id: string; participantId: string; seed: number }[]
): DivisionEntries => ({ version: 1, entries: list });

const config = (...matches: MatchingConfig["matches"]): MatchingConfig => ({
  version: 1,
  matches,
});

describe("validateEntries", () => {
  it("妥当なら空配列を返す", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
      ),
      ["p1", "p2", "p3"],
    );

    expect(result).toEqual([]);
  });

  it("ルール 1: id の重複を検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e1", participantId: "p2", seed: 1 },
      ),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("e1");
  });

  it("ルール 2: 存在しない participantId を検出する", () => {
    const result = validateEntries(
      entries({ id: "e1", participantId: "ghost", seed: 0 }),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 2: 同じ参加者の二重エントリーを検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p1", seed: 1 },
      ),
      ["p1"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("p1");
  });

  it("ルール 3: seed の重複を検出する", () => {
    const result = validateEntries(
      entries(
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 0 },
      ),
      ["p1", "p2"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("seed");
  });

  it("空のエントリーは妥当とする", () => {
    expect(validateEntries(entries(), [])).toEqual([]);
  });
});

describe("validateMatchingConfig", () => {
  const roster = entries(
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  );

  it("妥当なら空配列を返す", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [
            { kind: "entry", entryId: "e2" },
            { kind: "entry", entryId: "e3" },
          ],
        },
        {
          id: "m3",
          bracket: "winners",
          round: 2,
          order: 0,
          matchName: "3",
          slots: [
            { kind: "winnerOf", matchId: "m1" },
            { kind: "winnerOf", matchId: "m2" },
          ],
        },
      ),
      roster,
    );

    expect(result).toEqual([]);
  });

  it("ルール 4: 試合 id の重複を検出する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [{ kind: "entry", entryId: "e2" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("ルール 5: entries に無い entryId を検出する", () => {
    const result = validateMatchingConfig(
      config({
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "1",
        slots: [{ kind: "entry", entryId: "ghost" }, { kind: "bye" }],
      }),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 6: 存在しない matchId の参照を検出する", () => {
    const result = validateMatchingConfig(
      config({
        id: "m2",
        bracket: "winners",
        round: 2,
        order: 0,
        matchName: "1",
        slots: [{ kind: "winnerOf", matchId: "ghost" }, { kind: "bye" }],
      }),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 6: 同じ round への参照を検出する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [{ kind: "winnerOf", matchId: "m1" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("ルール 6: loserOf も round を検査する", () => {
    const result = validateMatchingConfig(
      config(
        {
          id: "m1",
          bracket: "winners",
          round: 2,
          order: 0,
          matchName: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 1,
          order: 0,
          matchName: "2",
          slots: [{ kind: "loserOf", matchId: "m1" }, { kind: "bye" }],
        },
      ),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("m1");
  });

  it("空の組み合わせは妥当とする", () => {
    expect(validateMatchingConfig(config(), roster)).toEqual([]);
  });

  it("試合名が重複していてもエラーにしない", () => {
    // 既定値はテンプレートなので、部門内の全試合が同じ文字列を持つのが正常な状態。
    const errors = validateMatchingConfig(
      {
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: DEFAULT_MATCH_NAME,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
          {
            id: "m1-1",
            bracket: "winners",
            round: 1,
            order: 1,
            matchName: DEFAULT_MATCH_NAME,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      },
      { version: 1, entries: [] },
    );

    expect(errors).toEqual([]);
  });

  it("matchName が空文字ならエラー", () => {
    const errors = validateMatchingConfig(
      {
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      },
      { version: 1, entries: [] },
    );
    expect(errors).toContain("m1-0: matchName が空です");
  });

  it("実施順（sequence）は検査しない", () => {
    const config: MatchingConfig = {
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          matchName: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    };

    expect(validateMatchingConfig(config, { version: 1, entries: [] })).toEqual(
      [],
    );
  });
});

/** 4 名のシングルエリミネーション。m3 が決勝。 */
const bracket = config(
  {
    id: "m1",
    bracket: "winners",
    round: 1,
    order: 0,
    matchName: "1",
    slots: [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ],
  },
  {
    id: "m2",
    bracket: "winners",
    round: 1,
    order: 1,
    matchName: "2",
    slots: [
      { kind: "entry", entryId: "e3" },
      { kind: "entry", entryId: "e4" },
    ],
  },
  {
    id: "m3",
    bracket: "winners",
    round: 2,
    order: 0,
    matchName: "3",
    slots: [
      { kind: "winnerOf", matchId: "m1" },
      { kind: "winnerOf", matchId: "m2" },
    ],
  },
);

const results = (...matches: DivisionResults["matches"]): DivisionResults => ({
  version: 1,
  matches,
});

describe("reachableEntryIds", () => {
  it("1 回戦は自分のスロットの entry だけを返す", () => {
    expect(reachableEntryIds("m1", bracket)).toEqual(new Set(["e1", "e2"]));
  });

  it("決勝は全ての entry を再帰的に集める", () => {
    expect(reachableEntryIds("m3", bracket)).toEqual(
      new Set(["e1", "e2", "e3", "e4"]),
    );
  });

  it("loserOf もたどる", () => {
    const doubleElim = config(
      {
        id: "w1",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "1",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
      {
        id: "l1",
        bracket: "losers",
        round: 2,
        order: 0,
        matchName: "2",
        slots: [{ kind: "loserOf", matchId: "w1" }, { kind: "bye" }],
      },
    );

    expect(reachableEntryIds("l1", doubleElim)).toEqual(new Set(["e1", "e2"]));
  });

  it("存在しない試合には何も返さない", () => {
    expect(reachableEntryIds("ghost", bracket)).toEqual(new Set());
  });
});

describe("validateResults", () => {
  it("妥当なら空配列を返す", () => {
    const errors = validateResults(
      results(
        { matchId: "m1", winnerEntryId: "e1" },
        { matchId: "m3", winnerEntryId: "e1", score: "3-1" },
      ),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toEqual([]);
  });

  it("ルール 7: matchingConfig に無い matchId を検出する", () => {
    const errors = validateResults(
      results({ matchId: "ghost", winnerEntryId: "e1" }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ghost");
  });

  it("ルール 7: 同じ matchId が 2 回現れたら検出する", () => {
    const errors = validateResults(
      results(
        { matchId: "m1", winnerEntryId: "e1" },
        { matchId: "m1", winnerEntryId: "e2" },
      ),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("m1");
  });

  it("ルール 8: その試合に到達しない winnerEntryId を検出する", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: "e3" }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("e3");
  });

  it("ルール 9: SINGLE_ELIMINATION の引き分けを弾く", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: null }),
      bracket,
      "SINGLE_ELIMINATION",
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ROUND_ROBIN");
  });

  it("ルール 9: ROUND_ROBIN の引き分けは許可する", () => {
    const errors = validateResults(
      results({ matchId: "m1", winnerEntryId: null }),
      bracket,
      "ROUND_ROBIN",
    );

    expect(errors).toEqual([]);
  });

  it("空の結果は妥当とする", () => {
    expect(validateResults(results(), bracket, "SINGLE_ELIMINATION")).toEqual(
      [],
    );
  });
});
