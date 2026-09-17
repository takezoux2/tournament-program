import { describe, expect, it } from "vitest";
import type {
  BracketMatch,
  DivisionResultConfig,
  MatchingConfig,
} from "@/lib/division/types";
import { DEFAULT_DIVISION_RESULT_CONFIG } from "@/lib/division/types";
import { buildResultRows } from "./result-rows";
import type {
  ScheduleDivision,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

const match = (
  id: string,
  round: number,
  order: number,
  matchName: string,
  slots: BracketMatch["slots"],
): BracketMatch => ({
  id,
  bracket: "winners",
  round,
  order,
  matchName,
  slots,
});

const matchingConfig: MatchingConfig = {
  version: 1,
  matches: [
    match("m1-0", 1, 0, "1", [
      { kind: "entry", entryId: "e1" },
      { kind: "entry", entryId: "e2" },
    ]),
    match("m1-1", 1, 1, "2", [
      { kind: "entry", entryId: "e3" },
      { kind: "bye" },
    ]),
    match("m2-0", 2, 0, "3", [
      { kind: "winnerOf", matchId: "m1-0" },
      { kind: "winnerOf", matchId: "m1-1" },
    ]),
  ],
};

const participants: ScheduleParticipant[] = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
];

const division = (results: ScheduleDivision["results"]): ScheduleDivision => ({
  id: "dA",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
      { id: "e3", participantId: "p3", seed: 2 },
    ],
  },
  matchingConfig,
  results,
  resultConfig: DEFAULT_DIVISION_RESULT_CONFIG,
});

const matchRow = (matchId: string, matchName: string): ScheduleRowView => ({
  kind: "match",
  key: `match:dA:${matchId}`,
  divisionId: "dA",
  divisionName: "男子",
  matchId,
  matchName,
  label: "1回戦 (1)",
  card: "山田 vs 佐藤",
});

const rows: ScheduleRowView[] = [
  matchRow("m1-0", "第1試合"),
  matchRow("m1-1", "第2試合"),
  matchRow("m2-0", "第3試合"),
];

const asMatch = (row: ReturnType<typeof buildResultRows>[number]) => {
  if (row.kind !== "match") {
    throw new Error("試合行ではありません");
  }
  return row;
};

describe("buildResultRows", () => {
  it("両者が確定した未記録の試合は ready で、名前がスロットに入る", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[0])).toMatchObject({
      matchId: "m1-0",
      state: "ready",
      winnerEntryId: null,
      downstreamRecordedCount: 0,
      slots: [
        { label: "山田", entryId: "e1" },
        { label: "佐藤", entryId: "e2" },
      ],
    });
  });

  it("BYE を含む試合は bye で、勝者が自動的に決まる", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[1])).toMatchObject({
      state: "bye",
      winnerEntryId: "e3",
      slots: [
        { label: "鈴木", entryId: "e3" },
        { label: "BYE", entryId: null },
      ],
    });
  });

  it("相手が未確定の試合は waiting で、構造上の表記を出す", () => {
    const result = buildResultRows(
      rows,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[2])).toMatchObject({
      state: "waiting",
      slots: [
        { label: "第1試合の勝者", entryId: null },
        { label: "鈴木", entryId: "e3" },
      ],
    });
  });

  it("記録済みの試合は recorded になり、下流の記録数を数える", () => {
    const result = buildResultRows(
      rows,
      [
        division({
          version: 1,
          matches: [
            { matchId: "m1-0", winnerEntryId: "e1" },
            { matchId: "m2-0", winnerEntryId: "e1" },
          ],
        }),
      ],
      participants,
    );

    expect(asMatch(result[0])).toMatchObject({
      state: "recorded",
      winnerEntryId: "e1",
      downstreamRecordedCount: 1,
    });
    expect(asMatch(result[2])).toMatchObject({
      state: "recorded",
      winnerEntryId: "e1",
      downstreamRecordedCount: 0,
    });
  });

  it("区切り行は見出しと開始予定時刻を素通しする", () => {
    const startsAt = new Date(2026, 8, 5, 9, 0);
    const withDivider: ScheduleRowView[] = [
      {
        kind: "divider",
        key: "divider:d1",
        id: "d1",
        label: "午前の部",
        startsAt,
        startsAtInput: "2026-09-05T09:00",
      },
      ...rows,
    ];

    const result = buildResultRows(
      withDivider,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(result[0]).toEqual({
      kind: "divider",
      key: "divider:d1",
      label: "午前の部",
      startsAt,
    });
  });

  it("実体の無い部門を指す行は落とす", () => {
    const result = buildResultRows(rows, [], participants);

    expect(result).toEqual([]);
  });

  const resultConfig: DivisionResultConfig = {
    version: 1,
    winReason: { enabled: true, options: ["一本勝ち"] },
    score: { enabled: true, count: 3, aggregation: "sum" },
    note: { enabled: true },
  };

  it("記録済みの詳細と部門の設定を行に載せる", () => {
    const result = buildResultRows(
      rows,
      [
        {
          ...division({
            version: 1,
            matches: [
              {
                matchId: "m1-0",
                winnerEntryId: "e1",
                winReason: "一本勝ち",
                scores: [{ entryId: "e1", values: [7, null, 7] }],
                note: "抗議あり",
              },
            ],
          }),
          resultConfig,
        },
      ],
      participants,
    );

    const row = result.find((r) => r.kind === "match" && r.matchId === "m1-0");
    expect(row).toMatchObject({
      resultConfig,
      winReason: "一本勝ち",
      scores: [{ entryId: "e1", values: [7, null, 7] }],
      note: "抗議あり",
    });
  });

  it("詳細が無い試合は null と空配列になる", () => {
    const result = buildResultRows(
      rows,
      [{ ...division({ version: 1, matches: [] }), resultConfig }],
      participants,
    );

    const row = result.find((r) => r.kind === "match" && r.matchId === "m1-0");
    expect(row).toMatchObject({ winReason: null, scores: [], note: null });
  });

  it("未確定のスロットは、行が持つ展開済みの試合名で「◯◯の勝者」と書く", () => {
    const named: ScheduleRowView[] = [
      matchRow("m1-0", "準決勝A"),
      matchRow("m1-1", "準決勝B"),
      matchRow("m2-0", "決勝"),
    ];

    const result = buildResultRows(
      named,
      [division({ version: 1, matches: [] })],
      participants,
    );

    expect(asMatch(result[2]).slots[0]).toEqual({
      label: "準決勝Aの勝者",
      entryId: null,
    });
  });
});
