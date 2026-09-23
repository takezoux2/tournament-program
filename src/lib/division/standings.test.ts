import { describe, expect, it } from "vitest";
import { leagueRankOrder } from "./standings";
import type { BracketMatch, MatchResultRecord } from "./types";

const entryMatch = (id: string, left: string, right: string): BracketMatch => ({
  id,
  bracket: "winners",
  round: 1,
  order: 0,
  matchName: id,
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

const entries = {
  version: 1 as const,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
  ],
};

const config = {
  version: 1 as const,
  matches: [
    entryMatch("m1", "e1", "e2"),
    entryMatch("m2", "e1", "e3"),
    entryMatch("m3", "e2", "e3"),
  ],
};

const results = (matches: MatchResultRecord[]) => ({
  version: 1 as const,
  matches,
});

describe("leagueRankOrder", () => {
  it("勝ち数の多い順に順位を付ける", () => {
    expect(
      leagueRankOrder(
        config,
        entries,
        results([
          { matchId: "m1", winnerEntryId: "e1" },
          { matchId: "m2", winnerEntryId: "e1" },
          { matchId: "m3", winnerEntryId: "e2" },
        ]),
      ),
    ).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 2 },
      { entryId: "e3", rank: 3 },
    ]);
  });

  it("勝点・勝ち数・直接対決が並ぶと同順位になる", () => {
    // 1 試合も行われていなければ全員 0 勝で並ぶ
    expect(leagueRankOrder(config, entries, results([]))).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 1 },
      { entryId: "e3", rank: 1 },
    ]);
  });

  it("巴戦は 3 人とも同順位になる", () => {
    expect(
      leagueRankOrder(
        config,
        entries,
        results([
          { matchId: "m1", winnerEntryId: "e1" },
          { matchId: "m2", winnerEntryId: "e3" },
          { matchId: "m3", winnerEntryId: "e2" },
        ]),
      ),
    ).toEqual([
      { entryId: "e1", rank: 1 },
      { entryId: "e2", rank: 1 },
      { entryId: "e3", rank: 1 },
    ]);
  });
});
