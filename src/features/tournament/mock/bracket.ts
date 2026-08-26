import type { Bracket, SlotSource } from "../types";

const p = (participantId: string): SlotSource => ({
  kind: "participant",
  participantId,
});
const w = (matchId: string): SlotSource => ({ kind: "winnerOf", matchId });
const bye: SlotSource = { kind: "bye" };

export const mockBracket: Bracket = {
  id: "b2026-summer",
  name: "2026 サマーカップ",
  matches: [
    // 1 回戦: 標準シーディング。シード 13〜16 が不在のため 4 試合が BYE
    { id: "r1-m1", round: 1, order: 0, slots: [p("p1"), bye] },
    { id: "r1-m2", round: 1, order: 1, slots: [p("p8"), p("p9")] },
    { id: "r1-m3", round: 1, order: 2, slots: [p("p5"), p("p12")] },
    { id: "r1-m4", round: 1, order: 3, slots: [p("p4"), bye] },
    { id: "r1-m5", round: 1, order: 4, slots: [p("p3"), bye] },
    { id: "r1-m6", round: 1, order: 5, slots: [p("p6"), p("p11")] },
    { id: "r1-m7", round: 1, order: 6, slots: [p("p7"), p("p10")] },
    { id: "r1-m8", round: 1, order: 7, slots: [p("p2"), bye] },
    // 準々決勝
    { id: "r2-m1", round: 2, order: 0, slots: [w("r1-m1"), w("r1-m2")] },
    { id: "r2-m2", round: 2, order: 1, slots: [w("r1-m3"), w("r1-m4")] },
    { id: "r2-m3", round: 2, order: 2, slots: [w("r1-m5"), w("r1-m6")] },
    { id: "r2-m4", round: 2, order: 3, slots: [w("r1-m7"), w("r1-m8")] },
    // 準決勝
    { id: "r3-m1", round: 3, order: 0, slots: [w("r2-m1"), w("r2-m2")] },
    { id: "r3-m2", round: 3, order: 1, slots: [w("r2-m3"), w("r2-m4")] },
    // 決勝
    { id: "r4-m1", round: 4, order: 0, slots: [w("r3-m1"), w("r3-m2")] },
  ],
};
