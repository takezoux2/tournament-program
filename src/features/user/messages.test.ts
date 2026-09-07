import { describe, expect, it } from "vitest";
import {
  AccountNotFound,
  type AuthError,
  InvalidCredentials,
  InvalidPassword,
  LastAccountUnlinkForbidden,
  PasswordAlreadySet,
  SessionNotFresh,
  UnexpectedAuthError,
  WeakPassword,
} from "@/shared/errors/auth-error";
import { profileErrorMessage } from "./messages";

describe("profileErrorMessage", () => {
  it("現在のパスワード違いは、そうと分かる文言にする", () => {
    expect(
      profileErrorMessage(new InvalidPassword({ code: "INVALID_PASSWORD" })),
    ).toBe("現在のパスワードが正しくありません");
  });

  it("パスワード未設定は、ログイン画面と違って言い切る", () => {
    // ログイン画面ではアカウントの存在を推測させないため曖昧にしているが、
    // ここは本人のセッションで見ているので隠す相手がいない。
    expect(
      profileErrorMessage(
        new InvalidCredentials({ code: "CREDENTIAL_ACCOUNT_NOT_FOUND" }),
      ),
    ).toBe("パスワードが設定されていません。先に設定してください");
  });

  it("古いセッションでの解除は、再ログインを促す", () => {
    expect(
      profileErrorMessage(new SessionNotFresh({ code: "SESSION_NOT_FRESH" })),
    ).toBe(
      "セキュリティのため、この操作にはログインし直しが必要です。一度ログアウトしてから再度お試しください",
    );
  });

  it("最後の 1 つの解除は、先にパスワードを設定するよう促す", () => {
    expect(
      profileErrorMessage(
        new LastAccountUnlinkForbidden({
          code: "FAILED_TO_UNLINK_LAST_ACCOUNT",
        }),
      ),
    ).toBe(
      "最後のログイン方法は解除できません。先にパスワードを設定してください",
    );
  });

  it("設定済みのパスワードの再設定は、変更として案内する", () => {
    expect(
      profileErrorMessage(
        new PasswordAlreadySet({ code: "PASSWORD_ALREADY_SET" }),
      ),
    ).toBe("パスワードは既に設定されています。変更から操作してください");
  });

  it("連携が見つからない場合の文言がある", () => {
    expect(
      profileErrorMessage(new AccountNotFound({ code: "ACCOUNT_NOT_FOUND" })),
    ).toBe("その連携は見つかりませんでした");
  });

  it("パスワードの長さ違反の文言がある", () => {
    expect(
      profileErrorMessage(new WeakPassword({ code: "PASSWORD_TOO_SHORT" })),
    ).toBe("パスワードの長さが要件を満たしていません");
  });

  it("未知のエラーは一般的な文言に畳む", () => {
    const error: AuthError = new UnexpectedAuthError({
      code: "WAT",
      reason: new Error("x"),
    });
    expect(profileErrorMessage(error)).toBe(
      "処理に失敗しました。時間をおいて再度お試しください",
    );
  });
});
