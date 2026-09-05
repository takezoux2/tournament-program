import { describe, expect, it } from "vitest";
import { formatStartsAt, formatPublicTitle } from "./format";

describe("formatStartsAt", () => {
  it("null を「未設定」にする", () => {
    expect(formatStartsAt(null)).toBe("未設定");
  });

  it("日時を年月日を含む文字列にする", () => {
    // 実行環境のタイムゾーンで表記が変わるため、年が含まれることだけを見る。
    expect(formatStartsAt(new Date(2026, 7, 29, 10, 5))).toContain("2026");
  });
});

describe("formatPublicTitle", () => {
  it("節を省くと「大会名 | 組織名」になる", () => {
    expect(formatPublicTitle("春季大会", "テニス部")).toBe("春季大会 | テニス部");
  });

  it("節を渡すと先頭に付く", () => {
    expect(formatPublicTitle("春季大会", "テニス部", "試合一覧")).toBe(
      "試合一覧 | 春季大会 | テニス部",
    );
  });
});
