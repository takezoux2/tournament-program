import { describe, expect, it } from "vitest";
import { setPasswordSchema } from "./schema";

describe("setPasswordSchema", () => {
  it("妥当なパスワードを通す", () => {
    const result = setPasswordSchema.safeParse({ newPassword: "newpassword" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ newPassword: "newpassword" });
    }
  });

  it("8 文字未満を弾く", () => {
    const result = setPasswordSchema.safeParse({ newPassword: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("128 文字超を弾く", () => {
    const result = setPasswordSchema.safeParse({
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });

  it("currentPassword を渡しても落とす（設定にはそもそも要らない）", () => {
    const result = setPasswordSchema.safeParse({
      newPassword: "newpassword",
      currentPassword: "anything",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("currentPassword");
    }
  });
});
