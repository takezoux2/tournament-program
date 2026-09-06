import { describe, expect, it } from "vitest";
import { loginIdentifierSchema } from "./identifier";

describe("loginIdentifierSchema", () => {
  it("アットマークを含む入力をメールアドレスとして扱い、正規化する", () => {
    const result = loginIdentifierSchema.safeParse(" User@Example.COM ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "email", email: "user@example.com" });
    }
  });

  it("アットマークを含まない入力をユーザー名として扱い、小文字に揃える", () => {
    const result = loginIdentifierSchema.safeParse(" TakeZoux2 ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "username", username: "takezoux2" });
    }
  });

  it("ハイフンとアンダースコアを含むユーザー名を通す", () => {
    // プラグイン既定の validator（"." を許し "-" を許さない）ではなく、
    // このプロジェクトの usernameSchema が効いていることの確認。
    expect(loginIdentifierSchema.safeParse("take-zoux_2").success).toBe(true);
  });

  it("空欄は識別子の文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ユーザー名またはメールアドレスを入力してください",
      );
    }
  });

  it("アットマークを含むが形式が不正なものはメールアドレスの文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("nope@");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "メールアドレスの形式が正しくありません",
      );
    }
  });

  it("使えない文字を含むユーザー名はユーザー名の文言で弾く", () => {
    const result = loginIdentifierSchema.safeParse("take zoux");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ユーザー名は半角英数字・アンダースコア・ハイフンのみ使えます",
      );
    }
  });
});
