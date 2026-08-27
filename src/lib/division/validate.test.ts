import { describe, expect, it } from "vitest";
import type { DivisionEntries, MatchingConfig } from "./types";
import { validateEntries, validateMatchingConfig } from "./validate";

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
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
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
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 1,
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
        slots: [{ kind: "entry", entryId: "ghost" }, { kind: "bye" }],
      }),
      roster,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("ghost");
  });

  it("ルール 6: 存재하지 않는 matchId의 참조를 검출한다", () => {
    const result = validateMatchingConfig(
      config({
        id: "m2",
        bracket: "winners",
        round: 2,
        order: 0,
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
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "winners",
          round: 1,
          order: 1,
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
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 1,
          order: 0,
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
});
