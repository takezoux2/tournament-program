import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  newPasswordSchema,
} from "./password-policy";

describe("newPasswordSchema", () => {
  it("下限ちょうどの長さを通す", () => {
    expect(
      newPasswordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH)).success,
    ).toBe(true);
  });

  it("下限より 1 文字短いと弾く", () => {
    const result = newPasswordSchema.safeParse(
      "a".repeat(MIN_PASSWORD_LENGTH - 1),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは8文字以上で入力してください",
      );
    }
  });

  it("上限ちょうどの長さを通す", () => {
    expect(
      newPasswordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH)).success,
    ).toBe(true);
  });

  it("上限より 1 文字長いと弾く", () => {
    const result = newPasswordSchema.safeParse(
      "a".repeat(MAX_PASSWORD_LENGTH + 1),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "パスワードは128文字以内で入力してください",
      );
    }
  });
});
