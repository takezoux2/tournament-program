import { describe, expect, it } from "vitest";
import { toAuthError } from "@/shared/errors/auth-error";
import { authErrorMessage } from "./messages";

describe("authErrorMessage", () => {
  it("ログイン失敗ではどちらが誤りか示さない", () => {
    const message = authErrorMessage(
      toAuthError("INVALID_EMAIL_OR_PASSWORD", null),
    );
    expect(message).toBe("メールアドレスまたはパスワードが正しくありません");
  });

  it("メール重複を伝える", () => {
    expect(
      authErrorMessage(
        toAuthError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null),
      ),
    ).toBe("このメールアドレスは既に登録されています");
  });

  it("パスワード長の不備を伝える", () => {
    expect(authErrorMessage(toAuthError("PASSWORD_TOO_SHORT", null))).toBe(
      "パスワードの長さが要件を満たしていません",
    );
  });

  it("ユーザー名重複の可能性を伝える", () => {
    // FAILED_TO_CREATE_USER は「作成に失敗した」一般形で、接続断や
    // アダプタの不具合でも返る。断定すると無関係な改名を促すことになる。
    expect(authErrorMessage(toAuthError("FAILED_TO_CREATE_USER", null))).toBe(
      "そのユーザー名は既に使われている可能性があります。別の名前でお試しください",
    );
  });

  it("未知の失敗は汎用文言にする", () => {
    expect(authErrorMessage(toAuthError(undefined, new Error("boom")))).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
