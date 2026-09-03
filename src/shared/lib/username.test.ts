import { describe, expect, it } from "vitest";
import { normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeUsername("  takezo  ")).toBe("takezo");
  });

  it("小文字に揃える", () => {
    expect(normalizeUsername("Takezo")).toBe("takezo");
  });

  it("空文字はそのまま空文字を返す", () => {
    expect(normalizeUsername("")).toBe("");
  });

  it("空白だけの文字列は空文字になる", () => {
    expect(normalizeUsername("   ")).toBe("");
  });
});
