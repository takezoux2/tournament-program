import { describe, expect, it } from "vitest";
import type { MatchingConfig } from "@/lib/division/types";
import { buildScheduleView, dividerKey, matchKey, toSaveItems } from "./domain";
import type { ScheduleDivision, ScheduleItemRecord } from "./types";

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
      matchNumber: numbers[0],
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
      matchNumber: numbers[1],
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
};

const participants = [
  { id: "p1", name: "山田" },
  { id: "p2", name: "佐藤" },
  { id: "p3", name: "鈴木" },
  { id: "p4", name: "田中" },
];

describe("buildScheduleView", () => {
  it("行が 1 件も無ければ部門順 → round → order で全試合を並べる", () => {
    const rows = buildScheduleView([divisionB, divisionA], participants, []);

    expect(rows.map((row) => row.key)).toEqual([
      matchKey("dA", "m1-0"),
      matchKey("dA", "m1-1"),
      matchKey("dB", "m1-0"),
      matchKey("dB", "m1-1"),
    ]);
  });

  it("試合行に部門名・試合番号・位置・対戦カードを載せる", () => {
    const [row] = buildScheduleView([divisionA], participants, []);

    expect(row).toEqual({
      kind: "match",
      key: matchKey("dA", "m1-0"),
      divisionId: "dA",
      divisionName: "男子",
      matchId: "m1-0",
      matchNumber: "1",
      label: "1回戦 第1試合",
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

  it("リーグの部門は節の文言で並べる", () => {
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
            matchNumber: "1",
            slots: [
              { kind: "entry", entryId: "g1" },
              { kind: "entry", entryId: "g2" },
            ],
          },
        ],
      },
    };

    const rows = buildScheduleView([league], participants, []);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("match");
    expect(rows[0].kind === "match" && rows[0].label).toBe("第1節 第1試合");
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
