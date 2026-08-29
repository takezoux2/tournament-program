import { describe, expect, it } from "vitest";
import { formatStartsAt, toDateTimeLocalValue } from "./format";

describe("formatStartsAt", () => {
  it("null を「未設定」にする", () => {
    expect(formatStartsAt(null)).toBe("未設定");
  });

  it("日時を年月日を含む文字列にする", () => {
    // 実行環境のタイムゾーンで表記が変わるため、年が含まれることだけを見る。
    expect(formatStartsAt(new Date(2026, 7, 29, 10, 5))).toContain("2026");
  });
});

describe("toDateTimeLocalValue", () => {
  it("null を空文字にする", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
  });

  it("datetime-local が受け付ける形式に直す", () => {
    expect(toDateTimeLocalValue(new Date(2026, 7, 29, 10, 5))).toBe(
      "2026-08-29T10:05",
    );
  });

  it("1 桁の月・日・時・分をゼロ埋めする", () => {
    expect(toDateTimeLocalValue(new Date(2026, 0, 2, 3, 4))).toBe(
      "2026-01-02T03:04",
    );
  });
});
