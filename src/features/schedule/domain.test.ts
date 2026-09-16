import { describe, expect, it } from "vitest";
import type { BracketMatch, MatchingConfig } from "@/lib/division/types";
import { buildScheduleView, dividerKey, matchKey, toSaveItems } from "./domain";
import type { ScheduleDivision, ScheduleItemRecord } from "./types";

/**
 * 試合名のテスト用の最小構成。round/order/slots はブラケット表示側の関心事で
 * このテストでは使わないため、既定値で埋めて呼び出し側からは隠す。
 */
const makeMatch = (
  overrides: Partial<BracketMatch> & Pick<BracketMatch, "id">,
): BracketMatch => ({
  bracket: "winners",
  round: 1,
  order: 0,
  sequence: 0,
  matchName: "1",
  slots: [{ kind: "bye" }, { kind: "bye" }],
  ...overrides,
});

/** 試合名のテスト用の最小の部門。entries は使わないので空のまま。 */
const makeDivision = (overrides: {
  id: string;
  order: number;
  matches: BracketMatch[];
}): ScheduleDivision => ({
  id: overrides.id,
  name: overrides.id,
  order: overrides.order,
  format: "SINGLE_ELIMINATION",
  entries: { version: 1, entries: [] },
  matchingConfig: { version: 1, matches: overrides.matches },
  results: { version: 1, matches: [] },
});

const config = (
  entryIds: [string, string],
  numbers: [string, string],
): MatchingConfig => ({
  version: 1,
  matches: [
    {
      id: "m1-0",
      bracket: "winners",
      round: 1,
      order: 0,
      sequence: 0,
      matchName: numbers[0],
      slots: [
        { kind: "entry", entryId: entryIds[0] },
        { kind: "entry", entryId: entryIds[1] },
      ],
    },
    {
      id: "m1-1",
      bracket: "winners",
      round: 1,
      order: 1,
      sequence: 1,
      matchName: numbers[1],
      slots: [{ kind: "entry", entryId: entryIds[0] }, { kind: "bye" }],
    },
  ],
});

const divisionA: ScheduleDivision = {
  id: "dA",
  name: "男子",
  order: 0,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "e1", participantId: "p1", seed: 0 },
      { id: "e2", participantId: "p2", seed: 1 },
    ],
  },
  matchingConfig: config(["e1", "e2"], ["1", "2"]),
  results: { version: 1, matches: [] },
};

const divisionB: ScheduleDivision = {
  id: "dB",
  name: "女子",
  order: 1,
  format: "SINGLE_ELIMINATION",
  entries: {
    version: 1,
    entries: [
      { id: "f1", participantId: "p3", seed: 0 },
      { id: "f2", participantId: "p4", seed: 1 },
    ],
  },
  matchingConfig: config(["f1", "f2"], ["1", "2"]),
  results: { version: 1, matches: [] },
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

/**
 * round/order（描画座標）と配列順（実施順）がわざと食い違う部門。
 * 2 回戦の試合を配列の先頭に置いてある。buildMatchRows が round/order で
 * 並べ直す実装に戻ると m1-0, m1-1, m2-0 の順になってしまうため、
 * このずれがあって初めて「並べ替えない」ことを検出できる。
 */
const outOfOrderDivision: ScheduleDivision = {
  id: "dC",
  name: "混合",
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
        id: "m2-0",
        bracket: "winners",
        round: 2,
        order: 0,
        sequence: 0,
        matchName: "1",
        slots: [
          { kind: "winnerOf", matchId: "m1-0" },
          { kind: "winnerOf", matchId: "m1-1" },
        ],
      },
      {
        id: "m1-0",
        bracket: "winners",
        round: 1,
        order: 0,
        sequence: 1,
        matchName: "2",
        slots: [
          { kind: "entry", entryId: "e1" },
          { kind: "entry", entryId: "e2" },
        ],
      },
      {
        id: "m1-1",
        bracket: "winners",
        round: 1,
        order: 1,
        sequence: 2,
        matchName: "3",
        slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
      },
    ],
  },
  results: { version: 1, matches: [] },
};

describe("buildScheduleView", () => {
  it("行が 1 件も無ければ部門順 → 部門内の実施順で全試合を並べる", () => {
    const rows = buildScheduleView([divisionB, divisionA], participants, []);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-0"),
      matchKey("dA", "m1-1"),
      matchKey("dB", "m1-0"),
      matchKey("dB", "m1-1"),
    ]);
  });

  it("部門内は round/order で並べ直さず、配列順（＝実施順）をそのまま使う", () => {
    const rows = buildScheduleView([outOfOrderDivision], participants, []);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dC", "m2-0"),
      matchKey("dC", "m1-0"),
      matchKey("dC", "m1-1"),
    ]);
  });

  it("試合行に部門名・試合名・位置・対戦カードを載せる", () => {
    const [row] = buildScheduleView([divisionA], participants, []);

    expect(row).toEqual({
      kind: "match",
      key: matchKey("dA", "m1-0"),
      divisionId: "dA",
      divisionName: "男子",
      matchId: "m1-0",
      matchName: "1",
      label: "1回戦 (1)",
      card: "山田 vs 佐藤",
    });
  });

  it("保存された並びを尊重し、区切りも同じ列に混ぜる", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dB", matchId: "m1-0" },
      {
        kind: "divider",
        id: "s2",
        label: "午前の部",
        // ローカル時刻で組み立てる。startsAtInput はローカル時刻の文字列なので、
        // UTC 指定だと実行環境の時刻帯で期待値が変わってしまう。
        startsAt: new Date(2026, 8, 5, 9, 0),
      },
      { kind: "match", id: "s3", divisionId: "dA", matchId: "m1-0" },
    ];

    const rows = buildScheduleView([divisionA, divisionB], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dB", "m1-0"),
      dividerKey("s2"),
      matchKey("dA", "m1-0"),
      // 行を持たない残りは決定的な順で末尾へ
      matchKey("dA", "m1-1"),
      matchKey("dB", "m1-1"),
    ]);
    expect(rows[1]).toEqual({
      kind: "divider",
      key: dividerKey("s2"),
      id: "s2",
      label: "午前の部",
      startsAt: new Date(2026, 8, 5, 9, 0),
      startsAtInput: "2026-09-05T09:00",
    });
  });

  it("実在しない試合を指す行は落とす", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dA", matchId: "消えた試合" },
      { kind: "match", id: "s2", divisionId: "消えた部門", matchId: "m1-0" },
    ];

    const rows = buildScheduleView([divisionA], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-0"),
      matchKey("dA", "m1-1"),
    ]);
  });

  it("同じ試合を指す行が重複していても 1 行にする", () => {
    const items: ScheduleItemRecord[] = [
      { kind: "match", id: "s1", divisionId: "dA", matchId: "m1-1" },
      { kind: "match", id: "s2", divisionId: "dA", matchId: "m1-1" },
    ];

    const rows = buildScheduleView([divisionA], participants, items);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-1"),
      matchKey("dA", "m1-0"),
    ]);
  });

  it("リーグの部門は位置の文言を空にする", () => {
    const league: ScheduleDivision = {
      id: "dL",
      name: "リーグ",
      order: 2,
      format: "ROUND_ROBIN",
      entries: {
        version: 1,
        entries: [
          { id: "g1", participantId: "p1", seed: 0 },
          { id: "g2", participantId: "p2", seed: 1 },
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
            sequence: 0,
            matchName: "1",
            slots: [
              { kind: "entry", entryId: "g1" },
              { kind: "entry", entryId: "g2" },
            ],
          },
        ],
      },
      results: { version: 1, matches: [] },
    };

    const rows = buildScheduleView([league], participants, []);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("match");
    expect(rows[0].kind === "match" && rows[0].label).toBe("");
  });
});

describe("toSaveItems", () => {
  it("表示行を保存用の形に落とす", () => {
    const rows = buildScheduleView([divisionA], participants, [
      { kind: "divider", id: "s2", label: "午前の部", startsAt: null },
    ]);

    expect(toSaveItems(rows)).toEqual([
      { kind: "divider", id: "s2", label: "午前の部", startsAt: null },
      { kind: "match", divisionId: "dA", matchId: "m1-0" },
      { kind: "match", divisionId: "dA", matchId: "m1-1" },
    ]);
  });
});

describe("buildScheduleView の試合名", () => {
  it("テンプレートを展開して行に載せる", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "第{{OverallSeq}}試合" }),
        makeMatch({ id: "m2", sequence: 1, matchName: "決勝" }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[0]).toMatchObject({ matchId: "m1", matchName: "第1試合" });
    expect(rows[1]).toMatchObject({ matchId: "m2", matchName: "決勝" });
  });

  it("部門内の番号（{{DivisionSeq}}）は展開しない", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({
          id: "m1",
          sequence: 1,
          matchName: "第{{DivisionSeq}}試合",
        }),
      ],
    });

    const rows = buildScheduleView([division], [], []);

    expect(rows[0]).toMatchObject({ matchId: "m1", matchName: "第試合" });
  });

  it("OverallSeq は区切りを数えず、保存された進行順に従う", () => {
    const division = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "{{OverallSeq}}" }),
        makeMatch({ id: "m2", sequence: 1, matchName: "{{OverallSeq}}" }),
      ],
    });

    const rows = buildScheduleView(
      [division],
      [],
      [
        { kind: "divider", id: "s1", label: "午前の部", startsAt: null },
        { kind: "match", id: "s2", divisionId: "d1", matchId: "m2" },
        { kind: "divider", id: "s3", label: "午後の部", startsAt: null },
        { kind: "match", id: "s4", divisionId: "d1", matchId: "m1" },
      ],
    );

    expect(
      rows.map((row) => (row.kind === "match" ? row.matchName : row.label)),
    ).toEqual(["午前の部", "1", "午後の部", "2"]);
  });

  it("OverallSeq は部門をまたいで通しで数える", () => {
    const first = makeDivision({
      id: "d1",
      order: 0,
      matches: [
        makeMatch({ id: "m1", sequence: 0, matchName: "{{OverallSeq}}" }),
      ],
    });
    const second = makeDivision({
      id: "d2",
      order: 1,
      matches: [
        makeMatch({ id: "n1", sequence: 0, matchName: "{{OverallSeq}}" }),
      ],
    });

    const rows = buildScheduleView([first, second], [], []);

    expect(
      rows.map((row) => (row.kind === "match" ? row.matchName : "")),
    ).toEqual(["1", "2"]);
  });
});
