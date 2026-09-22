import { describe, expect, it } from "vitest";
import type { DivisionDetail } from "@/features/division/repository";
import { prepareLeagueTable } from "./prepare-league-table";

const participants = [
  { id: "p1", name: "佐藤 蓮", nameKana: "サトウ レン", playerNumber: "1" },
  { id: "p2", name: "鈴木 陽菜", nameKana: "スズキ ハルナ", playerNumber: "2" },
];

const noSeq = new Map<string, number>();

const buildDivision = (
  overrides: Partial<DivisionDetail> = {},
): DivisionDetail => ({
  id: "d1",
  name: "リーグ",
  order: 0,
  format: "ROUND_ROBIN",
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
        id: "r1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        matchName: "1",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
    ],
  },
  results: { version: 1, matches: [{ matchId: "r1-0", winnerEntryId: "e2" }] },
  resultConfig: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...overrides,
});

describe("prepareLeagueTable", () => {
  it("結果込みの表を返す", () => {
    const prepared = prepareLeagueTable(buildDivision(), participants, noSeq);

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    // 勝った e2（鈴木）が 1 位
    expect(prepared.table.rows[0].label).toBe("鈴木 陽菜");
    expect(prepared.table.rows[0].wins).toBe(1);
  });

  it("withResults: false なら勝敗を数えず、印も付けない", () => {
    const prepared = prepareLeagueTable(buildDivision(), participants, noSeq, {
      withResults: false,
    });

    if (prepared.kind !== "ready") throw new Error("ready のはず");
    expect(prepared.table.rows.every((row) => row.wins === 0)).toBe(true);
    const cells = prepared.table.rows.flatMap((row) => row.cells);
    expect(
      cells.every((cell) => cell.kind !== "match" || cell.outcome === null),
    ).toBe(true);
  });

  it("Json が壊れていれば案内文を返す", () => {
    expect(
      prepareLeagueTable(
        buildDivision({ entries: "broken" }),
        participants,
        noSeq,
      ),
    ).toEqual({
      kind: "notice",
      message: "部門のデータを読み込めませんでした",
    });
  });

  it("組み合わせが無ければ案内文を返す", () => {
    expect(
      prepareLeagueTable(
        buildDivision({ matchingConfig: { version: 1, matches: [] } }),
        participants,
        noSeq,
      ),
    ).toEqual({ kind: "notice", message: "組み合わせが未作成です" });
  });
});
