import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("小文字に揃える", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("空文字はそのまま空文字を返す", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("空白だけの文字列は空文字になる", () => {
    expect(normalizeEmail("   ")).toBe("");
  });
});
