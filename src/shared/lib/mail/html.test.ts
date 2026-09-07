import { describe, expect, it } from "vitest";
import { escapeHtml, greetingName } from "./html";

describe("escapeHtml", () => {
  it("HTML の意味を持つ 5 文字を実体参照にする", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("& を最初に置換するので、実体参照が二重にならない", () => {
    expect(escapeHtml("<")).toBe("&lt;");
  });

  it("エスケープ不要な文字はそのまま返す", () => {
    expect(escapeHtml("竹添太郎")).toBe("竹添太郎");
  });
});

describe("greetingName", () => {
  it("名前があればそれを使う", () => {
    expect(greetingName({ email: "a@example.test", name: "竹添太郎" })).toBe(
      "竹添太郎",
    );
  });

  it("名前が空白だけならメールアドレスを使う", () => {
    expect(greetingName({ email: "a@example.test", name: "  " })).toBe(
      "a@example.test",
    );
  });

  it("名前が無ければメールアドレスを使う", () => {
    expect(greetingName({ email: "a@example.test" })).toBe("a@example.test");
  });
});
