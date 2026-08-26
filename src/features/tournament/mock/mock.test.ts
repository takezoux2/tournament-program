import { describe, expect, it } from "vitest";
import { mockBracket } from "./bracket";
import { mockParticipants } from "./participants";
import { mockResults } from "./results";

describe("mock data", () => {
  it("参加者 id が一意である", () => {
    const ids = mockParticipants.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("試合 id が一意である", () => {
    const ids = mockBracket.matches.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("participant スロットが実在する参加者を指している", () => {
    const participantIds = new Set(mockParticipants.map((p) => p.id));
    for (const match of mockBracket.matches) {
      for (const slot of match.slots) {
        if (slot.kind === "participant") {
          expect(participantIds).toContain(slot.participantId);
        }
      }
    }
  });

  it("winnerOf スロットが自分より前のラウンドの実在する試合を指している", () => {
    const matchById = new Map(mockBracket.matches.map((m) => [m.id, m]));
    for (const match of mockBracket.matches) {
      for (const slot of match.slots) {
        if (slot.kind === "winnerOf") {
          const source = matchById.get(slot.matchId);
          expect(source).toBeDefined();
          expect(source?.round).toBeLessThan(match.round);
        }
      }
    }
  });

  it("全参加者がちょうど 1 回だけ登場する", () => {
    const appearances = mockBracket.matches
      .flatMap((m) => m.slots)
      .flatMap((s) => (s.kind === "participant" ? [s.participantId] : []));
    expect(appearances).toHaveLength(mockParticipants.length);
    expect(new Set(appearances).size).toBe(mockParticipants.length);
  });

  it("勝敗データが実在する試合と参加者を指している", () => {
    const matchIds = new Set(mockBracket.matches.map((m) => m.id));
    const participantIds = new Set(mockParticipants.map((p) => p.id));
    for (const result of mockResults) {
      expect(matchIds).toContain(result.matchId);
      expect(participantIds).toContain(result.winnerId);
    }
  });

  it("勝敗データの試合 id が重複していない", () => {
    const ids = mockResults.map((r) => r.matchId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("決勝（最終ラウンド）の結果はまだ入っていない", () => {
    const lastRound = Math.max(...mockBracket.matches.map((m) => m.round));
    const finals = mockBracket.matches.filter((m) => m.round === lastRound);
    const resultMatchIds = new Set(mockResults.map((r) => r.matchId));
    for (const final of finals) {
      expect(resultMatchIds).not.toContain(final.id);
    }
  });
});
