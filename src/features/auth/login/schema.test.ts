import { describe, expect, it } from "vitest";
import { loginSchema } from "./schema";

describe("loginSchema", () => {
  it("正しい入力を通す", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "x" })
        .success,
    ).toBe(true);
  });

  it("メールアドレスを正規化する", () => {
    const result = loginSchema.safeParse({
      email: " User@Example.COM ",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("メール形式が不正だと弾く", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
  });

  it("パスワードが空だと弾く", () => {
    expect(
      loginSchema.safeParse({ email: "user@example.com", password: "" })
        .success,
    ).toBe(false);
  });
});
