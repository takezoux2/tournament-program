import { describe, expect, it } from "vitest";
import { displayNameSchema } from "./display-name";

describe("displayNameSchema", () => {
  it("前後の空白を落とす", () => {
    const result = displayNameSchema.safeParse("  竹添太郎  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("竹添太郎");
    }
  });

  it("空白だけの名前を弾く", () => {
    const result = displayNameSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });

  it("100 文字は通す", () => {
    expect(displayNameSchema.safeParse("あ".repeat(100)).success).toBe(true);
  });

  it("101 文字を弾く", () => {
    const result = displayNameSchema.safeParse("あ".repeat(101));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "名前は100文字以内で入力してください",
      );
    }
  });
});
