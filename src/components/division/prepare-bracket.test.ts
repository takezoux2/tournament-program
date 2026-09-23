import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { prepareBracket } from "./prepare-bracket";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "男子シングルス",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: {
    version: 1,
    matches: [
      {
        id: "m1",
        bracket: "winners",
        round: 1,
        order: 0,
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "m1", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("prepareBracket", () => {
  it("結果込みで解決し、座標を付けて返す", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq);

    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") return;
    expect(prepared.matches).toHaveLength(1);
    expect(prepared.matches[0].winnerId).toBe("e2");
    expect(prepared.positions.get("m1")).toEqual({ x: 0, y: 0 });
    expect(prepared.labels).toEqual([]);
  });

  it("withResults: false なら結果を無視する", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq, {
      withResults: false,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.matches[0].winnerId).toBeNull();
    expect(prepared.matches[0].slots.every((slot) => !slot.isWinner)).toBe(
      true,
    );
  });

  it("withPlayerNumber: true なら名前の前に選手番号を付ける", () => {
    const prepared = prepareBracket(buildDivision(), participants, noSeq, {
      withPlayerNumber: true,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.matches[0].slots[0].participant?.name).toBe("No.1 佐藤 蓮");
  });

  it("Json が壊れていれば案内文を返す", () => {
    expect(
      prepareBracket(buildDivision({ entries: "broken" }), participants, noSeq),
    ).toEqual({
      kind: "notice",
      message: "ブラケットのデータを読み込めませんでした",
    });
  });

  it("組み合わせが無ければ案内文を返す", () => {
    expect(
      prepareBracket(
        buildDivision({ matchingConfig: { version: 1, matches: [] } }),
        participants,
        noSeq,
      ),
    ).toEqual({ kind: "notice", message: "組み合わせが未作成です" });
  });

  it("リーグは案内文を返す", () => {
    expect(
      prepareBracket(
        buildDivision({ format: "ROUND_ROBIN" }),
        participants,
        noSeq,
      ),
    ).toEqual({
      kind: "notice",
      message: "「リーグ（総当たり）」のブラケット表示はまだ対応していません",
    });
  });

  it("参照エントリーの仮名を entryLabels 経由でブラケットに載せる", () => {
    const prepared = prepareBracket(
      buildDivision({
        entries: {
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
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              slots: [
                { kind: "entry", entryId: "x1" },
                { kind: "entry", entryId: "e2" },
              ],
            },
          ],
        },
        results: { version: 1, matches: [] },
      }),
      participants,
      noSeq,
      { entryLabels: new Map([["x1", "予選リーグA 1位"]]) },
    );

    expect(prepared.kind).toBe("ready");
  });
});
