import { describe, expect, it } from "vitest";
import { layoutBracket } from "../layout-bracket";
import { resolveBracket } from "../resolve-bracket";
import { toFlowElements } from "../to-flow-elements";
import type { MatchStatus, ResolvedMatch } from "../types";
import { mockBracket } from "./bracket";
import { mockParticipants } from "./participants";
import { mockResults } from "./results";

const byId = (matches: ResolvedMatch[], id: string): ResolvedMatch => {
  const match = matches.find((m) => m.id === id);
  if (!match) throw new Error(`no match ${id}`);
  return match;
};

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

describe("mock data end-to-end through resolveBracket -> layoutBracket -> toFlowElements", () => {
  const resolved = resolveBracket(mockParticipants, mockBracket, mockResults);

  it("例外を投げずに 15 試合を返す", () => {
    expect(resolved).toHaveLength(15);
  });

  it("nodes/edges がそれぞれ 15 件・14 件になる", () => {
    const { nodes, edges } = toFlowElements(resolved, layoutBracket(resolved));
    expect(nodes).toHaveLength(15);
    expect(edges).toHaveLength(14);
  });

  it("決勝 r4-m1 は waiting で、スロット 0 が p1・スロット 1 が pending", () => {
    const final = byId(resolved, "r4-m1");
    expect(final.status).toBe("waiting");
    expect(final.slots[0].participant?.id).toBe("p1");
    expect(final.slots[1].state).toBe("pending");
  });

  it("BYE の 4 試合は結果データが無くても bye 扱いで勝者が確定している", () => {
    for (const id of ["r1-m1", "r1-m4", "r1-m5", "r1-m8"]) {
      const match = byId(resolved, id);
      expect(match.status).toBe("bye");
      expect(match.winnerId).not.toBeNull();
    }
  });

  it("全試合のステータス内訳が bye:4, done:9, ready:1, waiting:1 になる", () => {
    const counts = resolved.reduce<Record<MatchStatus, number>>(
      (acc, match) => {
        acc[match.status] += 1;
        return acc;
      },
      { bye: 0, done: 0, ready: 0, waiting: 0 },
    );
    expect(counts).toEqual({ bye: 4, done: 9, ready: 1, waiting: 1 });
  });
});
