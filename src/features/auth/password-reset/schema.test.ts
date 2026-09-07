import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";
import { passwordResetRequestSchema, passwordResetSchema } from "./schema";

describe("passwordResetRequestSchema", () => {
  it("前後の空白を落とし小文字にそろえる", () => {
    const parsed = passwordResetRequestSchema.safeParse({
      email: "  User@Example.COM ",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("user@example.com");
  });

  it("形式が正しくないメールアドレスを弾く", () => {
    const parsed = passwordResetRequestSchema.safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toBe(
      "メールアドレスの形式が正しくありません",
    );
  });

  it("空文字を弾く", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

const valid = (password: string) => ({
  newPassword: password,
  confirmPassword: password,
});

describe("passwordResetSchema", () => {
  it("一致する十分な長さのパスワードを通す", () => {
    const parsed = passwordResetSchema.safeParse(valid("password123"));
    expect(parsed.success).toBe(true);
  });

  it("最小長ちょうどを通す", () => {
    const parsed = passwordResetSchema.safeParse(valid("a".repeat(MIN_PASSWORD_LENGTH)));
    expect(parsed.success).toBe(true);
  });

  it("最小長より 1 文字短いものを弾く", () => {
    const parsed = passwordResetSchema.safeParse(
      valid("a".repeat(MIN_PASSWORD_LENGTH - 1)),
    );
    expect(parsed.success).toBe(false);
  });

  it("確認用が一致しない場合を弾く", () => {
    const parsed = passwordResetSchema.safeParse({
      newPassword: "password123",
      confirmPassword: "password124",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toBe(
      "確認用のパスワードが一致しません",
    );
  });
});
