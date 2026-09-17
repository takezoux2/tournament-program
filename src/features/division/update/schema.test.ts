import { describe, expect, it } from "vitest";
import { updateDivisionSchema } from "./schema";

const base = {
  name: "男子シングルス",
  format: "SINGLE_ELIMINATION",
  resultConfig: {
    winReasonEnabled: true,
    winReasonOptions: "一本勝ち\n判定勝ち",
    scoreEnabled: true,
    scoreCount: "3",
    scoreAggregation: "average",
    noteEnabled: false,
  },
};

const parse = (override: Partial<typeof base.resultConfig>) =>
  updateDivisionSchema.safeParse({
    ...base,
    resultConfig: { ...base.resultConfig, ...override },
  });

describe("updateDivisionSchema の resultConfig", () => {
  it("設定を DivisionResultConfig に変換する", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.resultConfig).toEqual({
      version: 1,
      winReason: { enabled: true, options: ["一本勝ち", "判定勝ち"] },
      score: { enabled: true, count: 3, aggregation: "average" },
      note: { enabled: false },
    });
  });

  it("選択肢を trim し、空行と重複を落とす", () => {
    const result = parse({
      winReasonOptions: "  一本勝ち  \n\n判定勝ち\n一本勝ち\n   \n",
    });
    expect(result.success && result.data.resultConfig.winReason.options).toEqual(
      ["一本勝ち", "判定勝ち"],
    );
  });

  it("改行コードが CRLF でも 1 行 1 項目として読む", () => {
    const result = parse({ winReasonOptions: "一本勝ち\r\n判定勝ち" });
    expect(result.success && result.data.resultConfig.winReason.options).toEqual(
      ["一本勝ち", "判定勝ち"],
    );
  });

  it("30 文字を超える選択肢は弾く", () => {
    const result = parse({ winReasonOptions: "あ".repeat(31) });
    expect(result.success).toBe(false);
  });

  it("21 件以上の選択肢は弾く", () => {
    const result = parse({
      winReasonOptions: Array.from({ length: 21 }, (_, i) => `理由${i}`).join("\n"),
    });
    expect(result.success).toBe(false);
  });

  it("スコア欄の数が 1〜8 の外なら弾く", () => {
    expect(parse({ scoreCount: "0" }).success).toBe(false);
    expect(parse({ scoreCount: "9" }).success).toBe(false);
    expect(parse({ scoreCount: "1" }).success).toBe(true);
    expect(parse({ scoreCount: "8" }).success).toBe(true);
  });

  it("未知の集計方法は弾く", () => {
    expect(parse({ scoreAggregation: "median" }).success).toBe(false);
  });
});
