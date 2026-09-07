import { describe, expect, it } from "vitest";
import { loginSchema } from "./schema";

describe("loginSchema", () => {
  it("メールアドレスの入力を通す", () => {
    const result = loginSchema.safeParse({
      identifier: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toEqual({
        kind: "email",
        email: "user@example.com",
      });
    }
  });

  it("ユーザー名の入力を通す", () => {
    const result = loginSchema.safeParse({
      identifier: "takezoux2",
      password: "x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toEqual({
        kind: "username",
        username: "takezoux2",
      });
    }
  });

  it("識別子が空だと弾く", () => {
    expect(
      loginSchema.safeParse({ identifier: "", password: "x" }).success,
    ).toBe(false);
  });

  it("パスワードが空だと弾く", () => {
    expect(
      loginSchema.safeParse({ identifier: "user@example.com", password: "" })
        .success,
    ).toBe(false);
  });
});
