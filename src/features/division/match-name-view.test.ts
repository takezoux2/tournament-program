import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "@/lib/division/match-name";
import type { DivisionEntries } from "@/lib/division/types";
import { toMatchOrderView } from "./match-name-view";
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

const noNames = new Map<string, string>();

describe("toMatchOrderView", () => {
  it("配列の順のまま行にする", () => {
    const rows = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
      noNames,
    );

    expect(rows.map((row) => row.matchId)).toEqual(["m1-0", "m1-1", "m2-0"]);
  });

  it("位置の文言と対戦カードを載せる", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
      noNames,
    );

    expect(row).toEqual({
      matchId: "m1-0",
      template: DEFAULT_MATCH_NAME,
      matchName: DEFAULT_MATCH_NAME,
      label: "1回戦 (1)",
      card: "山田 vs 佐藤",
    });
  });

  it("名前を引けない参加者は（不明な参加者）として出す", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      [],
      "SINGLE_ELIMINATION",
      noNames,
    );

    expect(row.card).toBe("（不明な参加者） vs （不明な参加者）");
  });

  it("渡された展開済みの試合名を行に載せる", () => {
    const rows = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
      new Map([["m1-0", "第9試合"]]),
    );

    expect(rows[0].matchName).toBe("第9試合");
  });

  it("template には保存されているテンプレートを、matchName には展開後の名前を載せる", () => {
    const [row] = toMatchOrderView(
      config,
      entries,
      participants,
      "SINGLE_ELIMINATION",
      new Map([["m1-0", "第9試合"]]),
    );

    expect(row.template).toBe(DEFAULT_MATCH_NAME);
    expect(row.matchName).toBe("第9試合");
  });

  it("参照エントリーの仮名を対戦の表示に使う", () => {
    const rows = toMatchOrderView(
      {
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: "第1試合",
            slots: [
              { kind: "entry", entryId: "x1" },
              { kind: "entry", entryId: "e2" },
            ],
          },
        ],
      },
      {
        version: 1,
        entries: [
          {
            id: "x1",
            seed: 0,
            source: { kind: "leagueRank", divisionId: "d2", rank: 1 },
          },
          { id: "e2", participantId: "p2", seed: 1 },
        ],
      },
      [{ id: "p2", name: "佐藤" }],
      "SINGLE_ELIMINATION",
      new Map([["m1", "第1試合"]]),
      new Map([["x1", "予選リーグA 1位"]]),
    );

    expect(rows[0].card).toBe("予選リーグA 1位 vs 佐藤");
  });
});
