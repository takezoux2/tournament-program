import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html-escape";

describe("escapeHtml", () => {
  it("HTML の意味を持つ 5 文字を実体参照に変換する", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("& を先に変換するため、二重エスケープにならない", () => {
    // 順序を誤ると "&lt;" が "&amp;lt;" になる。
    expect(escapeHtml("<a>")).toBe("&lt;a&gt;");
  });

  it("クエリを含む URL の & をすべて変換する", () => {
    expect(escapeHtml("https://example.com/a?b=1&c=2&d=3")).toBe(
      "https://example.com/a?b=1&amp;c=2&amp;d=3",
    );
  });

  it("変換対象が無い文字列はそのまま返す", () => {
    expect(escapeHtml("竹添 太郎")).toBe("竹添 太郎");
  });
});
