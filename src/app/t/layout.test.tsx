import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

describe("公開ページ共通レイアウトの metadata", () => {
  it("robots で noindex, nofollow を指定する", () => {
    // これが無いと /t/** の各ページ（大会名や参加者の本名を含む）が
    // 検索エンジンに拾われてしまう。
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
