import { describe, expect, it } from "vitest";
import {
  DivisionJsonError,
  parseDivisionEntries,
  parseDivisionResultConfig,
  parseDivisionResults,
  parseMatchingConfig,
} from "./parse";
import {
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
  it("matchNumber を持つ試合はそのまま読む", () => {
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "A",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });
    expect(config.matches[0].matchNumber).toBe("A");
  });

  it("matchNumber の無い試合には round/order 順で未使用の連番を補完する", () => {
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
    const byId = new Map(config.matches.map((m) => [m.id, m.matchNumber]));
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
          matchNumber: "1",
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
    const byId = new Map(config.matches.map((m) => [m.id, m.matchNumber]));
    expect(byId.get("m1-1")).toBe("2");
  });

  it("matchNumber が文字列以外なら DivisionJsonError", () => {
    expect(() =>
      parseMatchingConfig({
        version: 1,
        matches: [
          {
            id: "m1-0",
            bracket: "winners",
            round: 1,
            order: 0,
            matchNumber: 1,
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
          sequence: 0,
          matchNumber: "1",
          slots: [{ kind: "entry", entryId: "e1" }, { kind: "bye" }],
        },
        {
          id: "m2",
          bracket: "losers",
          round: 2,
          order: 0,
          sequence: 1,
          matchNumber: "2",
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

  it("sequence の無い旧データには round/order 順で 0 からの連番を振る", () => {
    const match = (id: string, round: number, order: number) => ({
      id,
      bracket: "winners",
      round,
      order,
      matchNumber: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 配列順を round 順と逆に置き、並べ替えたうえで振ることを確かめる
      matches: [match("m2-0", 2, 0), match("m1-0", 1, 0), match("m1-1", 1, 1)],
    });

    // 返す配列自体が実施順になっている（下流は配列順をそのまま読む）
    expect(config.matches.map((match) => match.id)).toEqual([
      "m1-0",
      "m1-1",
      "m2-0",
    ]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("sequence があればその昇順に並べ、0 からの連番に詰め直す", () => {
    const match = (id: string, order: number, sequence: number) => ({
      id,
      bracket: "winners",
      round: 1,
      order,
      sequence,
      matchNumber: id,
      slots: [{ kind: "bye" }, { kind: "bye" }],
    });
    const config = parseMatchingConfig({
      version: 1,
      // 3 番目の試合を先頭へ動かしたあとの並び。値も 0 始まりでない。
      matches: [match("a", 0, 5), match("b", 1, 9), match("c", 2, 1)],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["c", "a", "b"]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1, 2]);
  });

  it("sequence が一部にしか無ければ全件を round/order 順で振り直す", () => {
    // 途中まで書き込まれた壊れたデータ。中途半端な値を信じると並びが
    // 飛び飛びになるので、揃っていないときは既定の順に戻す。
    const config = parseMatchingConfig({
      version: 1,
      matches: [
        {
          id: "m1-1",
          bracket: "winners",
          round: 1,
          order: 1,
          sequence: 0,
          matchNumber: "2",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
        {
          id: "m1-0",
          bracket: "winners",
          round: 1,
          order: 0,
          matchNumber: "1",
          slots: [{ kind: "bye" }, { kind: "bye" }],
        },
      ],
    });

    expect(config.matches.map((match) => match.id)).toEqual(["m1-0", "m1-1"]);
    expect(config.matches.map((match) => match.sequence)).toEqual([0, 1]);
  });

  it("sequence が整数以外なら DivisionJsonError", () => {
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
            matchNumber: "1",
            slots: [{ kind: "bye" }, { kind: "bye" }],
          },
        ],
      }),
    ).toThrow(/matchingConfig\.matches\[0\]\.sequence/);
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
