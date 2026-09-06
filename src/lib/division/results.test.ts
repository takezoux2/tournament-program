import { describe, expect, it } from "vitest";
import { applyMatchResult, clearResults } from "./results";
import { EMPTY_DIVISION_RESULTS } from "./types";

describe("applyMatchResult", () => {
  it("空の results に 1 件追加する", () => {
    const next = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: "e1",
      score: "3-1",
    });

    expect(next).toEqual({
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: "e1", score: "3-1" }],
    });
  });

  it("同じ matchId は上書きし、件数を増やさない", () => {
    const first = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: "e1",
      score: "3-1",
    });
    const second = applyMatchResult(first, {
      matchId: "m1",
      winnerEntryId: "e2",
      score: "1-3",
    });

    expect(second.matches).toEqual([
      { matchId: "m1", winnerEntryId: "e2", score: "1-3" },
    ]);
  });

  it("上書きしても他の試合の並び順を保つ", () => {
    let current = EMPTY_DIVISION_RESULTS;
    current = applyMatchResult(current, { matchId: "m1", winnerEntryId: "e1" });
    current = applyMatchResult(current, { matchId: "m2", winnerEntryId: "e3" });
    current = applyMatchResult(current, { matchId: "m1", winnerEntryId: "e2" });

    expect(current.matches.map((record) => record.matchId)).toEqual([
      "m1",
      "m2",
    ]);
    expect(current.matches[0].winnerEntryId).toBe("e2");
  });

  it("引き分けを記録できる", () => {
    const next = applyMatchResult(EMPTY_DIVISION_RESULTS, {
      matchId: "m1",
      winnerEntryId: null,
    });

    expect(next.matches[0].winnerEntryId).toBeNull();
  });

  it("元の値を変更しない", () => {
    const before = EMPTY_DIVISION_RESULTS;
    applyMatchResult(before, { matchId: "m1", winnerEntryId: "e1" });

    expect(before.matches).toEqual([]);
  });
});

describe("clearResults", () => {
  const results = {
    version: 1 as const,
    matches: [
      { matchId: "m1", winnerEntryId: "e1" },
      { matchId: "m2", winnerEntryId: "e2" },
      { matchId: "m3", winnerEntryId: "e3" },
    ],
  };

  it("指定した試合の記録だけを取り除く", () => {
    expect(clearResults(results, new Set(["m1", "m3"]))).toEqual({
      version: 1,
      matches: [{ matchId: "m2", winnerEntryId: "e2" }],
    });
  });

  it("元の値は変更しない", () => {
    clearResults(results, new Set(["m1"]));

    expect(results.matches).toHaveLength(3);
  });

  it("空集合なら同じ内容を返す", () => {
    expect(clearResults(EMPTY_DIVISION_RESULTS, new Set<string>())).toEqual(
      EMPTY_DIVISION_RESULTS,
    );
  });
});
