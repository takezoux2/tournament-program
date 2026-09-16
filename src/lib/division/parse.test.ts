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
  it("matchName を持つ試合はそのまま読む", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "A",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });
    expect(config.matches[0].matchName).toBe("A");
  });

  it("matchName の無い試合には round/order 順で未使用の連番を補完する", () => {
    const match = (id: string, round: number, order: number) => ({
      id,
      bracket: "winners",
      round,
      order,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 配列順は round 順と逆に置き、round/order 順で補完されることを確かめる
      matches: [match("m2-0", 2, 0), match("m1-0", 1, 0), match("m1-1", 1, 1)],
    });
    const byId = new Map(config.matches.map((m) => [m.id, m.matchName]));
    expect(byId.get("m1-0")).toBe("1");
    expect(byId.get("m1-1")).toBe("2");
    expect(byId.get("m2-0")).toBe("3");
  });

  it("補完する連番は既に使われている番号を飛ばす", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });
    const byId = new Map(config.matches.map((m) => [m.id, m.matchName]));
    expect(byId.get("m1-1")).toBe("2");
  });

  it("matchName が文字列以外なら DivisionJsonError", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchName: 1,
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(DivisionJsonError);
  });

  it("4 種類の SlotSource を全て受け付ける", () => {
    const value = {
      version: 1,
      matches: [
        {
          id: "m1",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 2,
          order: 0,
          matchName: "2",
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

  it("matches は round → order の順に並べて返す", () => {
    const match = (id: string, round: number, order: number) => ({
      id,
      bracket: "winners",
      round,
      order,
      matchName: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 配列順を round/order 順と食い違わせ、並べ直すことを確かめる
      matches: [match("m2-0", 2, 0), match("m1-1", 1, 1), match("m1-0", 1, 0)],
    });

    // 返す配列の順が下流（編集一覧・進行順の末尾追加）の並びになる
    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
  });

  it("保存済みの sequence は読まずに捨て、並びにも使わない", () => {
    // 部門内の並べ替えで sequence を書いていた旧データ。
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 0,
          matchName: "b",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          sequence: 1,
          matchName: "a",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["m1-0", "m1-1"]);
    expect(config.matches[0]).not.toHaveProperty("sequence");
  });

  it("sequence が整数でなくてもエラーにしない（読まないため）", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            sequence: "1",
            matchName: "1",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).not.toThrow();
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
