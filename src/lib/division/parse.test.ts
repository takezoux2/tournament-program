import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_NAME } from "./match-name";
import {
  DivisionJsonError,
  parseDivisionEntries,
  parseDivisionResultConfig,
  parseDivisionResultConfigOrDefault,
  parseDivisionResults,
  parseMatchingConfig,
} from "./parse";
import {
  DEFAULT_DIVISION_RESULT_CONFIG,
  MAX_NOTE_LENGTH,
  MAX_WIN_REASON_LENGTH,
  MAX_WIN_REASON_OPTIONS,
} from "./types";

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

  it("matchName の無い試合には既定のテンプレートを入れる", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchName: "決勝",
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

    expect(config.matches.map((match) => match.matchName)).toEqual([
      "決勝",
      DEFAULT_MATCH_NAME,
    ]);
  });

  it("旧データの matchNumber は読み継がない", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "7",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches[0].matchName).toBe(DEFAULT_MATCH_NAME);
    expect(config.matches[0]).not.toHaveProperty("matchNumber");
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

  it("ブラケットは勝者側 → 敗者側 → 決勝の順に並べる", () => {
    const match = (
      id: string,
      bracket: string,
      round: number,
      order: number,
    ) => ({
      id,
      bracket,
      round,
      order,
      matchName: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // round は全ブラケット通し（敗者側 L1 は round 2）。
      matches: [
        match("f", "final", 4, 0),
        match("l1-0", "losers", 2, 0),
        match("m2-0", "winners", 2, 0),
        match("m1-1", "winners", 1, 1),
        match("m1-0", "winners", 1, 0),
      ],
    });

    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
      "l1-0",
      "f",
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

describe("parseDivisionResultConfigOrDefault", () => {
  it("正しい設定はそのまま返す", () => {
    const valid = {
      version: 1,
      winReason: { enabled: true, options: ["一本勝ち"] },
      score: { enabled: true, count: 2, aggregation: "sum" },
      note: { enabled: true },
    };
    expect(parseDivisionResultConfigOrDefault(valid)).toEqual(valid);
  });

  it("壊れた設定は既定値に落とす", () => {
    expect(parseDivisionResultConfigOrDefault({ version: 2 })).toBe(
      DEFAULT_DIVISION_RESULT_CONFIG,
    );
    expect(parseDivisionResultConfigOrDefault(null)).toBe(
      DEFAULT_DIVISION_RESULT_CONFIG,
    );
  });

  // Json の形の誤り以外（プログラムの不具合など）まで既定値で覆い隠さない。
  it("DivisionJsonError 以外の例外はそのまま投げる", () => {
    const broken = {
      version: 1,
      get winReason(): unknown {
        throw new TypeError("boom");
      },
    };
    expect(() => parseDivisionResultConfigOrDefault(broken)).toThrow(TypeError);
  });
});

describe("parseDivisionResultConfig", () => {
  const valid = {
    version: 1,
    winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
    score: { enabled: true, count: 3, aggregation: "average" },
    note: { enabled: false },
  };

  it("正しい設定をそのまま返す", () => {
    expect(parseDivisionResultConfig(valid)).toEqual(valid);
  });

  it("count が範囲外なら弾く", () => {
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        score: { ...valid.score, count: 9 },
      }),
    ).toThrow(DivisionJsonError);
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        score: { ...valid.score, count: 0 },
      }),
    ).toThrow(DivisionJsonError);
  });

  it("aggregation が未知の値なら弾く", () => {
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        score: { ...valid.score, aggregation: "median" },
      }),
    ).toThrow(DivisionJsonError);
  });

  it("enabled が真偽値でなければ弾く", () => {
    expect(() =>
      parseDivisionResultConfig({ ...valid, note: { enabled: "yes" } }),
    ).toThrow(DivisionJsonError);
  });

  it("winReason.options が上限件数を超えたら弾く", () => {
    const tooMany = Array.from(
      { length: MAX_WIN_REASON_OPTIONS + 1 },
      (_, index) => `理由${index}`,
    );
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        winReason: { ...valid.winReason, options: tooMany },
      }),
    ).toThrow(DivisionJsonError);
  });

  it("winReason.options の 1 件が上限文字数を超えたら弾く", () => {
    const tooLong = "あ".repeat(MAX_WIN_REASON_LENGTH + 1);
    expect(() =>
      parseDivisionResultConfig({
        ...valid,
        winReason: { ...valid.winReason, options: [tooLong] },
      }),
    ).toThrow(DivisionJsonError);
  });
});

describe("parseDivisionResults の詳細項目", () => {
  const base = {
    version: 1,
    matches: [
      {
        matchId: "m1",
        winnerEntryId: "e1",
        winReason: "一本勝ち",
        scores: [
          { entryId: "e1", values: [7, 6.8, null] },
          { entryId: "e2", values: [6.5, 6.9, 6.6] },
        ],
        note: "主審の判定に抗議あり",
      },
    ],
  };

  it("勝因・スコア・メモを読む", () => {
    expect(parseDivisionResults(base)).toEqual(base);
  });

  it("詳細項目を持たない旧データもそのまま読める", () => {
    const old = {
      version: 1,
      matches: [{ matchId: "m1", winnerEntryId: "e1" }],
    };
    expect(parseDivisionResults(old)).toEqual(old);
  });

  it("スコアが範囲外なら弾く", () => {
    const over = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          scores: [{ entryId: "e1", values: [1000] }],
        },
      ],
    };
    expect(() => parseDivisionResults(over)).toThrow(DivisionJsonError);
  });

  it("スコアが数値でも null でもなければ弾く", () => {
    const bad = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          scores: [{ entryId: "e1", values: ["7"] }],
        },
      ],
    };
    expect(() => parseDivisionResults(bad)).toThrow(DivisionJsonError);
  });

  it("winReason が上限文字数を超えたら弾く", () => {
    const tooLong = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          winReason: "あ".repeat(MAX_WIN_REASON_LENGTH + 1),
        },
      ],
    };
    expect(() => parseDivisionResults(tooLong)).toThrow(DivisionJsonError);
  });

  it("note が上限文字数を超えたら弾く", () => {
    const tooLong = {
      version: 1,
      matches: [
        {
          matchId: "m1",
          winnerEntryId: "e1",
          note: "あ".repeat(MAX_NOTE_LENGTH + 1),
        },
      ],
    };
    expect(() => parseDivisionResults(tooLong)).toThrow(DivisionJsonError);
  });
});
