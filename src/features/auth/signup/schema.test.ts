import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";
import { signupSchema } from "./schema";

const valid = {
  name: "竹添",
  email: "user@example.com",
  password: "a".repeat(MIN_PASSWORD_LENGTH),
};

describe("signupSchema", () => {
  it("正しい入力を通す", () => {
    const result = signupSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("メールアドレスを正規化する", () => {
    const result = signupSchema.safeParse({
      ...valid,
      email: "  User@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("名前の前後の空白を落とす", () => {
    const result = signupSchema.safeParse({ ...valid, name: "  竹添  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("竹添");
    }
  });

  it("名前が空だと弾く", () => {
    expect(signupSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false,
    );
  });

  it("メール形式が不正だと弾く", () => {
    expect(
      signupSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("パスワードが下限より短いと弾く", () => {
    expect(
      signupSchema.safeParse({
        ...valid,
        password: "a".repeat(MIN_PASSWORD_LENGTH - 1),
      }).success,
    ).toBe(false);
  });
});
