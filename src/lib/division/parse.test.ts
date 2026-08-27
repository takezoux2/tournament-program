import { describe, expect, it } from "vitest";
import {
  DivisionJsonError,
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "./parse";

describe("parseDivisionEntries", () => {
  it("妥当な値をそのまま返す", () => {
    const value = {
      version: 1,
      entries: [
        { id: "e1", participantId: "p1", seed: 0 },
        { id: "e2", participantId: "p2", seed: 1 },
      ],
    };

    expect(parseDivisionEntries(value)).toEqual(value);
  });

  it("デフォルト値の空構造を受け付ける", () => {
    expect(parseDivisionEntries({ version: 1, entries: [] })).toEqual({
      version: 1,
      entries: [],
    });
  });

  it("version が 1 以外なら弾く", () => {
    expect(() => parseDivisionEntries({ version: 2, entries: [] })).toThrow(
      DivisionJsonError,
    );
  });

  it("空オブジェクトを弾く", () => {
    expect(() => parseDivisionEntries({})).toThrow(DivisionJsonError);
  });

  it("seed が整数でなければ弾く", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [{ id: "e1", participantId: "p1", seed: 1.5 }],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("エラーメッセージに場所が入る", () => {
    expect(() =>
      parseDivisionEntries({
        version: 1,
        entries: [{ id: "e1", participantId: 42, seed: 0 }],
      }),
    ).toThrow(/entries\.entries\[0\]\.participantId/);
  });
});

describe("parseMatchingConfig", () => {
  it("4 種類の SlotSource を全て受け付ける", () => {
    const value = {
      version: 1,
      matches: [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 2,
          order: 0,
          slots: [
            { kind: "winnerOf", matchId: "m1" },
            { kind: "loserOf", matchId: "m1" },
          ],
        },
      ],
    };

    expect(parseMatchingConfig(value)).toEqual(value);
  });

  it("想定外の kind を弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            slots: [
              { kind: "participant", participantId: "p1" },
              { kind: "bye" },
            ],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("想定外の bracket を弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "consolation",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("slots が 2 個でなければ弾く", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1",
            bracket: "winners",
            round: 1,
            order: 0,
            slots: [{ kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });
});

describe("parseDivisionResults", () => {
  it("勝者ありの結果を受け付ける", () => {
    const value = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          score: "3-1",
          finishedAt: "2026-08-27T10:00:00.000Z",
        },
      ],
    };

    expect(parseDivisionResults(value)).toEqual(value);
  });

  it("引き分け（winnerEntryId が null）を受け付ける", () => {
    const value = {
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: null }],
    };

    expect(parseDivisionResults(value)).toEqual(value);
  });

  it("省略可能な score / finishedAt が無くても通る", () => {
    const parsed = parseDivisionResults({
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: "e1" }],
    });

    expect(parsed.matches[0]).not.toHaveProperty("score");
    expect(parsed.matches[0]).not.toHaveProperty("finishedAt");
  });

  it("winnerEntryId が文字列でも null でもなければ弾く", () => {
    expect(() =>
      parseDivisionResults({
        version: 1,
        matches: [{ matchId: "m1", winnerEntryId: 1 }],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("matches が配列でなければ弾く", () => {
    expect(() =>
      parseDivisionResults({ version: 1, matches: { m1: "e1" } }),
    ).toThrow(DivisionJsonError);
  });
});
