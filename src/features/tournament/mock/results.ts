import type { MatchResult } from "../types";

export const mockResults: MatchResult[] = [
  // 1 回戦（BYE 以外の 4 試合）
  { matchId: "r1-m2", winnerId: "p8", score: "2-0" },
  { matchId: "r1-m3", winnerId: "p12", score: "2-1" },
  { matchId: "r1-m6", winnerId: "p6", score: "2-0" },
  { matchId: "r1-m7", winnerId: "p10", score: "2-1" },
  // 準々決勝
  { matchId: "r2-m1", winnerId: "p1", score: "3-1" },
  { matchId: "r2-m2", winnerId: "p4", score: "3-0" },
  { matchId: "r2-m3", winnerId: "p6", score: "3-2" },
  { matchId: "r2-m4", winnerId: "p2", score: "3-1" },
  // 準決勝（片方のみ決着）
  { matchId: "r3-m1", winnerId: "p1", score: "3-2" },
];
