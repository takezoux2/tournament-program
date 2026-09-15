import { describe, expect, it } from "vitest";
import type {
  BracketMatch,
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";
import { toLeagueTableView } from "./standings";

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

const match = (order: number, left: string, right: string): BracketMatch => ({
  id: `r1-${order}`,
  bracket: "winners",
  round: 1,
  order,
  sequence: order,
  matchNumber: String(order + 1),
  slots: [
    { kind: "entry", entryId: left },
    { kind: "entry", entryId: right },
  ],
});

// buildRoundRobin(4 人) と同じ並び。第1試合 = e1 vs e4 ... 第6試合 = e3 vs e4
const config: MatchingConfig = {
  version: 1,
  matches: [
    match(0, "e1", "e4"),
    match(1, "e2", "e3"),
    match(2, "e1", "e3"),
    match(3, "e4", "e2"),
    match(4, "e1", "e2"),
    match(5, "e3", "e4"),
  ],
};

const results = (
  records: [matchId: string, winnerEntryId: string | null][],
): DivisionResults => ({
  version: 1,
  matches: records.map(([matchId, winnerEntryId]) => ({
    matchId,
    winnerEntryId,
  })),
});

const summary = (view: ReturnType<typeof toLeagueTableView>) =>
  view.rows.map((row) => [
    row.entryId,
    row.rank,
    row.wins,
    row.draws,
    row.losses,
    row.points,
  ]);

describe("toLeagueTableView", () => {
  it("全試合済みなら勝点順に並び、順位は 1 から連番になる", () => {
    // e1 が全勝、e2 が e3・e4 に勝ち、e3 が e4 に勝つ
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 3, 0, 0, 9],
      ["e2", 2, 2, 0, 1, 6],
      ["e3", 3, 1, 0, 2, 3],
      ["e4", 4, 0, 0, 3, 0],
    ]);
  });

  it("見出しと各行のマスは順位順で、対角は self になる", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(view.headers).toEqual([
      { entryId: "e1", label: "山田" },
      { entryId: "e2", label: "佐藤" },
      { entryId: "e3", label: "鈴木" },
      { entryId: "e4", label: "田中" },
    ]);
    expect(view.rows[0].cells).toEqual([
      { kind: "self" },
      { kind: "match", matchNumber: "5", outcome: "win" },
      { kind: "match", matchNumber: "3", outcome: "win" },
      { kind: "match", matchNumber: "1", outcome: "win" },
    ]);
    // e2 の行。e1 には負け、e3・e4 には勝ち。表は左右対称になる
    expect(view.rows[1].cells).toEqual([
      { kind: "match", matchNumber: "5", outcome: "loss" },
      { kind: "self" },
      { kind: "match", matchNumber: "2", outcome: "win" },
      { kind: "match", matchNumber: "4", outcome: "win" },
    ]);
  });

  it("未実施の試合は集計せず、マスには試合番号だけ残す", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-0", "e1"]]),
      participants,
    );

    // e2・e3・e4 は勝点も勝ち数も 0 で、直接対決も未実施なので全員 2 位
    expect(summary(view)).toEqual([
      ["e1", 1, 1, 0, 0, 3],
      ["e2", 2, 0, 0, 0, 0],
      ["e3", 2, 0, 0, 0, 0],
      ["e4", 2, 0, 0, 1, 0],
    ]);
    expect(view.rows[1].cells[2]).toEqual({
      kind: "match",
      matchNumber: "2",
      outcome: null,
    });
  });

  it("引き分けは両者に 1 点で、両者とも draw になる", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-4", null]]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 0, 1, 0, 1],
      ["e2", 1, 0, 1, 0, 1],
      ["e3", 3, 0, 0, 0, 0],
      ["e4", 3, 0, 0, 0, 0],
    ]);
    expect(view.rows[0].cells[1]).toEqual({
      kind: "match",
      matchNumber: "5",
      outcome: "draw",
    });
    expect(view.rows[1].cells[0]).toEqual({
      kind: "match",
      matchNumber: "5",
      outcome: "draw",
    });
  });

  it("勝点と勝ち数が並んだら直接対決で上下を決める", () => {
    // e1: e3・e4 に勝ち e2 に負け（6 点）。e2: e1・e4 に勝ち e3 に負け（6 点）
    // e3: e2 に勝ち e1・e4 に負け（3 点）。e4: e3 に勝ち e1・e2 に負け（3 点）
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e3"],
        ["r1-2", "e1"],
        ["r1-3", "e2"],
        ["r1-4", "e2"],
        ["r1-5", "e4"],
      ]),
      participants,
    );

    // シード順なら e1, e2 / e3, e4 だが、直接対決で e2 > e1、e4 > e3
    expect(summary(view)).toEqual([
      ["e2", 1, 2, 0, 1, 6],
      ["e1", 2, 2, 0, 1, 6],
      ["e4", 3, 1, 0, 2, 3],
      ["e3", 4, 1, 0, 2, 3],
    ]);
    expect(view.headers.map((header) => header.entryId)).toEqual([
      "e2",
      "e1",
      "e4",
      "e3",
    ]);
  });

  it("巴戦は同順位にし、次の順位は飛ばす", () => {
    // e1 > e2 > e3 > e1 の三すくみ。e4 は全敗
    const view = toLeagueTableView(
      config,
      entries,
      results([
        ["r1-0", "e1"],
        ["r1-1", "e2"],
        ["r1-2", "e3"],
        ["r1-3", "e2"],
        ["r1-4", "e1"],
        ["r1-5", "e3"],
      ]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 2, 0, 1, 6],
      ["e2", 1, 2, 0, 1, 6],
      ["e3", 1, 2, 0, 1, 6],
      ["e4", 4, 0, 0, 3, 0],
    ]);
  });

  it("勝者がどちらのスロットにも居ない記録は未実施として読む", () => {
    const view = toLeagueTableView(
      config,
      entries,
      results([["r1-0", "e9"]]),
      participants,
    );

    expect(summary(view)).toEqual([
      ["e1", 1, 0, 0, 0, 0],
      ["e2", 1, 0, 0, 0, 0],
      ["e3", 1, 0, 0, 0, 0],
      ["e4", 1, 0, 0, 0, 0],
    ]);
    expect(view.rows[0].cells[3]).toEqual({
      kind: "match",
      matchNumber: "1",
      outcome: null,
    });
  });

  it("entry 以外のスロットを持つ試合は無視して落ちない", () => {
    const broken: MatchingConfig = {
      version: 1,
      matches: [
        match(0, "e1", "e2"),
        {
          ...match(1, "e3", "e4"),
          slots: [
            { kind: "entry", entryId: "e3" },
            { kind: "winnerOf", matchId: "r1-0" },
          ],
        },
      ],
    };

    const view = toLeagueTableView(broken, entries, results([]), participants);

    expect(view.rows[2].cells[3]).toEqual({ kind: "none" });
    expect(view.rows[0].cells[1]).toEqual({
      kind: "match",
      matchNumber: "1",
      outcome: null,
    });
  });

  it("名前を引けないエントリーは（不明な参加者）にする", () => {
    const view = toLeagueTableView(config, entries, results([]), [
      participants[0],
    ]);

    expect(view.headers.map((header) => header.label)).toEqual([
      "山田",
      "（不明な参加者）",
      "（不明な参加者）",
      "（不明な参加者）",
    ]);
  });

  it("エントリーが無ければ見出しも行も空", () => {
    const view = toLeagueTableView(
      { version: 1, matches: [] },
      { version: 1, entries: [] },
      results([]),
      participants,
    );

    expect(view).toEqual({ headers: [], rows: [] });
  });
});
