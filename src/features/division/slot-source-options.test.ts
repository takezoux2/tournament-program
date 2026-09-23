import { describe, expect, it } from "vitest";
import type { EntrySourceDivision } from "@/lib/division/entry-source";
import { buildSlotSourceOptions } from "./slot-source-options";

const division = (
  id: string,
  name: string,
  format: EntrySourceDivision["format"],
  entryCount: number,
  matchIds: string[],
): EntrySourceDivision => ({
  id,
  name,
  format,
  entries: {
    version: 1,
    entries: Array.from({ length: entryCount }, (_, index) => ({
      id: `${id}-e${index}`,
      participantId: `${id}-p${index}`,
      seed: index,
    })),
  },
  matchingConfig: {
    version: 1,
    matches: matchIds.map((matchId, order) => ({
      id: matchId,
      bracket: "winners",
      round: 1,
      order,
      matchName: matchId,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    })),
  },
  results: { version: 1, matches: [] },
});

describe("buildSlotSourceOptions", () => {
  it("自部門を除き、試合と順位の上限を返す", () => {
    const options = buildSlotSourceOptions(
      [
        division("d1", "予選トーナメント", "SINGLE_ELIMINATION", 2, ["q1"]),
        division("d2", "予選リーグA", "ROUND_ROBIN", 3, ["n1", "n2", "n3"]),
        division("d9", "決勝トーナメント", "SINGLE_ELIMINATION", 0, []),
      ],
      "d9",
    );

    expect(options).toEqual([
      {
        divisionId: "d1",
        divisionName: "予選トーナメント",
        format: "SINGLE_ELIMINATION",
        matches: [{ matchId: "q1", label: "1回戦 (1)" }],
        maxRank: 0,
      },
      {
        divisionId: "d2",
        divisionName: "予選リーグA",
        format: "ROUND_ROBIN",
        matches: [
          { matchId: "n1", label: "n1" },
          { matchId: "n2", label: "n2" },
          { matchId: "n3", label: "n3" },
        ],
        maxRank: 3,
      },
    ]);
  });

  it("展開済みの試合名があればそれを使う", () => {
    const withNames: EntrySourceDivision = {
      ...division("d1", "予選トーナメント", "SINGLE_ELIMINATION", 2, ["q1"]),
      matchNames: new Map([["q1", "第3試合"]]),
    };

    expect(buildSlotSourceOptions([withNames], "d9")[0].matches).toEqual([
      { matchId: "q1", label: "第3試合" },
    ]);
  });
});
