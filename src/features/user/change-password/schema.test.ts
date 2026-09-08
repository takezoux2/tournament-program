import { describe, expect, it } from "vitest";
import { changePasswordSchema } from "./schema";

describe("changePasswordSchema", () => {
  it("妥当な組み合わせを通す", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(true);
  });

  it("現在のパスワードが空なら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "現在のパスワードを入力してください",
      );
    }
  });

  it("現在のパスワードは長さで弾かない（ポリシー変更前の値でも通す）", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "newpassword",
    });
    expect(result.success).toBe(true);
  });

  it("新しいパスワードが 8 文字未満なら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("新しいパスワードが 128 文字を超えたら弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpassword",
      newPassword: "a".repeat(129),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });

  it("現在と同じパスワードへの変更を弾く", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "samepassword",
      newPassword: "samepassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "現在と違うパスワードを入力してください",
      );
    }
  });
});
