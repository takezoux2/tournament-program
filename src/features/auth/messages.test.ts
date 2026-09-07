import { describe, expect, it } from "vitest";
import { SessionNotFresh, toAuthError } from "@/shared/errors/auth-error";
import { authErrorMessage } from "./messages";

describe("authErrorMessage", () => {
  it("ログイン失敗ではどれが誤りか示さない", () => {
    const message = authErrorMessage(
      toAuthError("INVALID_EMAIL_OR_PASSWORD", null),
    );
    // ユーザー名でログインした人にも当てはまる文言にする。
    expect(message).toBe(
      "ユーザー名・メールアドレスまたはパスワードが正しくありません",
    );
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

  it("ユーザー名重複を伝える", () => {
    expect(
      authErrorMessage(toAuthError("USERNAME_IS_ALREADY_TAKEN", null)),
    ).toBe("そのユーザー名は既に使われています。別の名前でお試しください");
  });

  it("ユーザー名の形式の不備を伝える", () => {
    expect(authErrorMessage(toAuthError("INVALID_USERNAME", null))).toBe(
      "ユーザー名の形式が正しくありません",
    );
  });

  it("未確認のメールアドレスであることと、再送したことを伝える", () => {
    // sendOnSignIn を有効にしてあるため、この失敗と同時に確認メールが送り直される。
    expect(authErrorMessage(toAuthError("EMAIL_NOT_VERIFIED", null))).toBe(
      "メールアドレスが未確認です。確認メールを再送しました",
    );
  });

  it("未知の失敗は汎用文言にする", () => {
    expect(authErrorMessage(toAuthError(undefined, new Error("boom")))).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });

  it("プロフィール経路のタグにも文言がある（網羅の抜けを検出するため）", () => {
    expect(
      authErrorMessage(new SessionNotFresh({ code: "SESSION_NOT_FRESH" })),
    ).toBe("セキュリティのため、再度ログインしてからお試しください");
  });
});
