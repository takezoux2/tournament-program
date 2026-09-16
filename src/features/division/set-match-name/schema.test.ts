import { describe, expect, it } from "vitest";
import { setMatchNameSchema } from "./schema";

const parse = (matchName: string, matchId = "m1-0") =>
  setMatchNameSchema.safeParse({ matchId, matchName });

describe("setMatchNameSchema", () => {
  it("前後の空白を落として受け付ける", () => {
    const result = parse("  決勝  ");

    expect(result.success && result.data.matchName).toBe("決勝");
  });

  it("変数を含む文字列を受け付ける", () => {
    expect(parse("第{{OverallSeq}}試合").success).toBe(true);
  });

  it("空白だけの試合名を拒む", () => {
    const result = parse("   ");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名を入力してください",
    );
  });

  it("100 文字までは受け付ける", () => {
    expect(parse("あ".repeat(100)).success).toBe(true);
  });

  it("100 文字を超える試合名を拒む", () => {
    const result = parse("あ".repeat(101));

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名は100文字以内で入力してください",
    );
  });

  it("閉じ忘れた区画を拒む", () => {
    const result = parse("{{#a}}第1試合");

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe(
      "試合名の書き方が正しくありません",
    );
  });

  it("知らない変数は拒まない（展開時に空文字になる）", () => {
    expect(parse("第{{Foo}}試合").success).toBe(true);
  });

  it("matchId が空なら拒む", () => {
    expect(parse("決勝", "").success).toBe(false);
  });
});
