import { describe, expect, it } from "vitest";
import type { DivisionEntries } from "@/lib/division/types";
import { toMatchOrderView } from "./match-number-view";
import { buildFromSlots } from "./single-elimination/build";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
    { id: "e3", participantId: "p3", seed: 2 },
    { id: "e4", participantId: "p4", seed: 3 },
  ],
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

const config = buildFromSlots([
  { kind: "entry", entryId: "e1" },
  { kind: "entry", entryId: "e2" },
  { kind: "entry", entryId: "e3" },
  { kind: "entry", entryId: "e4" },
]);

describe("toMatchOrderView", () => {
  it("配列の順（＝実施順）のまま行にする", () => {
    const rows = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(rows.map((row) => row.matchId)).toEqual(["m1-0", "m1-1", "m2-0"]);
  });

  it("並べ替え済みの配列は並べ直さずにそのまま返す", () => {
    // 実施順を入れ替えたあとの config。round/order で並べ直す実装だと
    // 元の順に戻ってしまうので、このテストが効く。
    const reordered = {
      version: 1 as const,
      matches: [
        { ...config.matches[2], sequence: 0, matchNumber: "1" },
        { ...config.matches[0], sequence: 1, matchNumber: "2" },
        { ...config.matches[1], sequence: 2, matchNumber: "3" },
      ],
    };

    const rows = toMatchOrderView(
      reordered,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(rows.map((row) => row.matchId)).toEqual(["m2-0", "m1-0", "m1-1"]);
  });

  it("位置の文言と対戦カードを載せる", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
    );

    expect(row).toEqual({
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
      card: "山田 vs 佐藤",
    });
  });

  it("名前を引けない参加者は（不明な参加者）として出す", () => {
    const [row] = toMatchOrderView(config, entries, [], "SINGLE_ELIMINATION");

    expect(row.card).toBe("（不明な参加者） vs （不明な参加者）");
  });
});
