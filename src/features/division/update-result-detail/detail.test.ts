import { describe, expect, it } from "vitest";
import type {
  DivisionResultConfig,
  MatchResultRecord,
} from "@/lib/division/types";
import { buildDetailRecord, isAcceptableWinReason } from "./detail";

const allEnabled: DivisionResultConfig = {
  version: 1,
  winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
  score: { enabled: true, count: 3, aggregation: "sum" },
  note: { enabled: true },
};

const existing: MatchResultRecord = { matchId: "m1", winnerEntryId: "e1" };
const standing = ["e1", "e2"];

const input = {
  matchId: "m1",
  winReason: "一本勝ち",
  scores: [
    { entryId: "e1", values: [7, 6.8, 7.2] },
    { entryId: "e2", values: [6.5, 6.9, 6.6] },
  ],
  note: "  主審の判定に抗議あり  ",
};

describe("buildDetailRecord", () => {
  it("有効な項目を書き、勝敗は触らない", () => {
    expect(buildDetailRecord(existing, input, allEnabled, standing)).toEqual({
      matchId: "m1",
      winnerEntryId: "e1",
      winReason: "一本勝ち",
      scores: [
        { entryId: "e1", values: [7, 6.8, 7.2] },
        { entryId: "e2", values: [6.5, 6.9, 6.6] },
      ],
      note: "主審の判定に抗議あり",
    });
  });

  it("無効な項目は書かず、既存値も消さない", () => {
    const disabled: DivisionResultConfig = {
      ...allEnabled,
      winReason: { enabled: false, options: [] },
      note: { enabled: false },
    };
    const withValues: MatchResultRecord = {
      ...existing,
      winReason: "判定勝ち",
      note: "既存のメモ",
    };

    const result = buildDetailRecord(withValues, input, disabled, standing);
    expect(result.winReason).toBe("判定勝ち");
    expect(result.note).toBe("既存のメモ");
  });

  it("空文字は解除として扱う", () => {
    const withValues: MatchResultRecord = {
      ...existing,
      winReason: "一本勝ち",
      note: "既存のメモ",
    };
    const result = buildDetailRecord(
      withValues,
      { ...input, winReason: "", note: "   " },
      allEnabled,
      standing,
    );
    expect(result).not.toHaveProperty("winReason");
    expect(result).not.toHaveProperty("note");
  });

  it("この試合に立っていない entryId のスコアは捨てる", () => {
    const result = buildDetailRecord(
      existing,
      {
        ...input,
        scores: [
          { entryId: "e1", values: [7, null, null] },
          { entryId: "e9", values: [9, 9, 9] },
        ],
      },
      allEnabled,
      standing,
    );
    expect(result.scores).toEqual([{ entryId: "e1", values: [7, null, null] }]);
  });

  // 同じ人のスコアが 2 件あると、どちらを表示・集計するか決まらない。
  // 画面の並び（DOM の順）で先に来たものを正とする。
  it("同じ entryId のスコアが重なったら最初の 1 件だけ残す", () => {
    const result = buildDetailRecord(
      existing,
      {
        ...input,
        scores: [
          { entryId: "e1", values: [7, 7, 7] },
          { entryId: "e1", values: [1, 1, 1] },
        ],
      },
      allEnabled,
      standing,
    );
    expect(result.scores).toEqual([{ entryId: "e1", values: [7, 7, 7] }]);
  });

  it("count を超えたスコアは切り詰める", () => {
    const result = buildDetailRecord(
      existing,
      { ...input, scores: [{ entryId: "e1", values: [1, 2, 3, 4, 5] }] },
      allEnabled,
      standing,
    );
    expect(result.scores).toEqual([{ entryId: "e1", values: [1, 2, 3] }]);
  });

  it("全部未入力のスコアは持たない", () => {
    const withScores: MatchResultRecord = {
      ...existing,
      scores: [{ entryId: "e1", values: [7, 7, 7] }],
    };
    const result = buildDetailRecord(
      withScores,
      {
        ...input,
        scores: [
          { entryId: "e1", values: [null, null, null] },
          { entryId: "e2", values: [null, null, null] },
        ],
      },
      allEnabled,
      standing,
    );
    expect(result).not.toHaveProperty("scores");
  });
});

describe("isAcceptableWinReason", () => {
  it("選択肢にある値は受け入れる", () => {
    expect(isAcceptableWinReason("判定勝ち", allEnabled, existing)).toBe(true);
  });

  it("空文字（解除）は受け入れる", () => {
    expect(isAcceptableWinReason("", allEnabled, existing)).toBe(true);
  });

  it("選択肢に無い値は拒否する", () => {
    expect(isAcceptableWinReason("反則負け", allEnabled, existing)).toBe(false);
  });

  it("一覧から消されたが今その試合に入っている値は受け入れる", () => {
    const recorded: MatchResultRecord = { ...existing, winReason: "反則負け" };
    expect(isAcceptableWinReason("反則負け", allEnabled, recorded)).toBe(true);
  });
});
