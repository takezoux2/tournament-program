import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";
import { signupSchema } from "./schema";

const valid = {
  name: "竹添",
  username: "takezo",
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

  it("username は前後の空白を落として受け取る", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "  takezo  ",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.username).toBe("takezo");
    }
  });

  it("username は小文字に正規化して受け取る", () => {
    // Takezo と takezo を別アカウントとして登録できると、検索も外れる。
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "TakeZo_01",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.username).toBe("takezo_01");
    }
  });

  it("username が空なら弾く", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "   ",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名を入力してください",
      );
    }
  });

  it("username に使えない文字が含まれていれば弾く", () => {
    const parsed = signupSchema.safeParse({
      name: "竹添",
      username: "take zo",
      email: "takezo@example.com",
      password: "password123",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      );
    }
  });
});
