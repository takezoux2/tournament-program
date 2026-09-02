import { describe, expect, it } from "vitest";
import { searchUserSchema } from "./schema";

describe("searchUserSchema", () => {
  it("前後の空白を落とす", () => {
    const parsed = searchUserSchema.safeParse({ query: "  takezo  " });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.query).toBe("takezo");
    }
  });

  it("空文字は弾く", () => {
    const parsed = searchUserSchema.safeParse({ query: "   " });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名またはメールアドレスを入力してください",
      );
    }
  });
});
