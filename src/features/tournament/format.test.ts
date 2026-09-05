import { describe, expect, it } from "vitest";
import { formatStartsAt } from "./format";

describe("formatStartsAt", () => {
  it("null を「未設定」にする", () => {
    expect(formatStartsAt(null)).toBe("未設定");
  });

  it("日時を年月日を含む文字列にする", () => {
    // 実行環境のタイムゾーンで表記が変わるため、年が含まれることだけを見る。
    expect(formatStartsAt(new Date(2026, 7, 29, 10, 5))).toContain("2026");
  });
});
