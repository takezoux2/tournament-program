import { describe, expect, it } from "vitest";
import type {
  DivisionEntries,
  DivisionResults,
  MatchingConfig,
} from "@/lib/division/types";
import { fromDivision } from "./from-division";

const entries: DivisionEntries = {
  version: 1,
  entries: [
    { id: "e1", participantId: "p1", seed: 0 },
    { id: "e2", participantId: "p2", seed: 1 },
  ],
};

const matchingConfig: MatchingConfig = {
  version: 1,
  matches: [
    {
      id: "m1",
      bracket: "winners",
      round: 1,
      order: 0,
      sequence: 0,
      matchName: "1",
      slots: [
        { kind: "entry", entryId: "e1" },
        { kind: "entry", entryId: "e2" },
      ],
    },
  ],
};

const emptyResults: DivisionResults = { version: 1, matches: [] };

const participants = [
  { id: "p1", name: "佐藤 蓮", team: "青葉クラブ" },
  { id: "p2", name: "鈴木 陽菜" },
];

const buildInput = (
  overrides: Partial<Parameters<typeof fromDivision>[0]> = {},
) => ({
  id: "d1",
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION" as const,
  entries,
  matchingConfig,
  results: emptyResults,
  participants,
  ...overrides,
});

describe("fromDivision", () => {
  it("エントリーを描画用の参加者へ写し、部門内シードを使う", () => {
    const result = fromDivision(buildInput());

    expect(result).not.toBeNull();
    // 描画側の participantId には entryId を使う。matchingConfig と results が
    // どちらも entryId で参照しているため、そのまま突き合わせられる。
    expect(result?.participants).toEqual([
      { id: "e1", name: "佐藤 蓮", seed: 0, team: "青葉クラブ" },
      { id: "e2", name: "鈴木 陽菜", seed: 1, team: undefined },
    ]);
  });

  it("試合のスロットを entryId 参照へ写す", () => {
    const result = fromDivision(buildInput());

    expect(result?.bracket).toEqual({
      id: "d1",
      name: "男子シングルス",
      matches: [
        {
          id: "m1",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [
            { kind: "participant", participantId: "e1" },
            { kind: "participant", participantId: "e2" },
          ],
        },
      ],
    });
  });

  it("matchName を描画側の Match に写す", () => {
    const result = fromDivision(buildInput());
    expect(result?.bracket.matches[0].matchName).toBe("1");
  });

  it("winnerOf と bye はそのまま運ぶ", () => {
    const result = fromDivision(
      buildInput({
        matchingConfig: {
          version: 1,
          matches: [
            {
              id: "m1",
              bracket: "winners",
              round: 1,
              order: 0,
              sequence: 0,
              matchName: "1",
              slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
            },
            {
              id: "m2",
              bracket: "winners",
              round: 2,
              order: 0,
              sequence: 1,
              matchName: "2",
              slots: [
                { kind: "winnerOf", matchId: "m1" },
                { kind: "entry", entryId: "e2" },
              ],
            },
          ],
        },
      }),
    );

    expect(result?.bracket.matches[0].slots[1]).toEqual({ kind: "bye" });
    expect(result?.bracket.matches[1].slots[0]).toEqual({
      kind: "winnerOf",
      matchId: "m1",
    });
  });

  it("勝者記録を entryId のまま運ぶ", () => {
    const result = fromDivision(
      buildInput({
        results: {
          version: 1,
          matches: [{ matchId: "m1", winnerEntryId: "e1", score: "3-1" }],
        },
      }),
    );

    expect(result?.results).toEqual([
      { matchId: "m1", winnerId: "e1", score: "3-1" },
    ]);
  });

  // 引き分けは ROUND_ROBIN 専用の概念で、描画側の MatchResult.winnerId は
  // null を取れない。結果ごと捨てて未決の試合として描く。
  it("引き分け（winnerEntryId: null）は結果を捨てて未決扱いにする", () => {
    const result = fromDivision(
      buildInput({
        results: {
          version: 1,
          matches: [{ matchId: "m1", winnerEntryId: null }],
        },
      }),
    );

    expect(result?.results).toEqual([]);
    // 結果を捨てても試合そのものは残る（未決として描く）。
    expect(result?.bracket.matches).toEqual([
      {
        id: "m1",
        round: 1,
        order: 0,
        matchName: "1",
        slots: [
          { kind: "participant", participantId: "e1" },
          { kind: "participant", participantId: "e2" },
        ],
      },
    ]);
  });

  it("SINGLE_ELIMINATION 以外は null", () => {
    expect(fromDivision(buildInput({ format: "ROUND_ROBIN" }))).toBeNull();
    expect(
      fromDivision(buildInput({ format: "DOUBLE_ELIMINATION_GRAND_FINAL" })),
    ).toBeNull();
  });

  it("組み合わせが未作成なら null", () => {
    expect(
      fromDivision(buildInput({ matchingConfig: { version: 1, matches: [] } })),
    ).toBeNull();
  });

  it("loserOf を含むなら null", () => {
    expect(
      fromDivision(
        buildInput({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1",
                bracket: "winners",
                round: 1,
                order: 0,
                sequence: 0,
                matchName: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "loserOf", matchId: "m0" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("winners 以外のブラケットを含むなら null", () => {
    expect(
      fromDivision(
        buildInput({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1",
                bracket: "losers",
                round: 1,
                order: 0,
                sequence: 0,
                matchName: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e2" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("エントリーの参照先の参加者が居なければ null", () => {
    expect(
      fromDivision(buildInput({ participants: [participants[0]] })),
    ).toBeNull();
  });

  it("winnerOf が matchingConfig に無い試合 id を指すなら null", () => {
    expect(
      fromDivision(
        buildInput({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m2",
                bracket: "winners",
                round: 2,
                order: 0,
                sequence: 0,
                matchName: "1",
                slots: [
                  { kind: "winnerOf", matchId: "m1" },
                  { kind: "entry", entryId: "e2" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("試合スロットの entryId が entries に無いなら null", () => {
    expect(
      fromDivision(
        buildInput({
          matchingConfig: {
            version: 1,
            matches: [
              {
                id: "m1",
                bracket: "winners",
                round: 1,
                order: 0,
                sequence: 0,
                matchName: "1",
                slots: [
                  { kind: "entry", entryId: "e1" },
                  { kind: "entry", entryId: "e999" },
                ],
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("エントリーに現れない参加者は描画対象に含めない", () => {
    const result = fromDivision(
      buildInput({
        participants: [...participants, { id: "p3", name: "高橋 大和" }],
      }),
    );

    expect(result?.participants.map((p) => p.name)).toEqual([
      "佐藤 蓮",
      "鈴木 陽菜",
    ]);
  });
});
