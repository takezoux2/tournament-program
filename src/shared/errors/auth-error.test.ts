import { describe, expect, it } from "vitest";
import { toAuthError } from "./auth-error";

describe("toAuthError", () => {
  it("INVALID_EMAIL_OR_PASSWORD を InvalidCredentials に写像する", () => {
    expect(toAuthError("INVALID_EMAIL_OR_PASSWORD", null)._tag).toBe(
      "InvalidCredentials",
    );
  });

  it("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL を EmailAlreadyExists に写像する", () => {
    expect(
      toAuthError("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", null)._tag,
    ).toBe("EmailAlreadyExists");
  });

  it("USER_ALREADY_EXISTS を EmailAlreadyExists に写像する", () => {
    expect(toAuthError("USER_ALREADY_EXISTS", null)._tag).toBe(
      "EmailAlreadyExists",
    );
  });

  it("PASSWORD_TOO_SHORT を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null)._tag).toBe("WeakPassword");
  });

  it("PASSWORD_TOO_LONG を WeakPassword に写像する", () => {
    expect(toAuthError("PASSWORD_TOO_LONG", null)._tag).toBe("WeakPassword");
  });

  it("INVALID_USERNAME_OR_PASSWORD を InvalidCredentials に写像する", () => {
    // /sign-in/username が返すコード。/sign-in/email の
    // INVALID_EMAIL_OR_PASSWORD と同じ扱いにする。
    expect(toAuthError("INVALID_USERNAME_OR_PASSWORD", null)._tag).toBe(
      "InvalidCredentials",
    );
  });

  it("USERNAME_IS_ALREADY_TAKEN を UsernameAlreadyExists に写像する", () => {
    // username プラグインが /sign-up/email の前段で重複を弾いたときのコード。
    expect(toAuthError("USERNAME_IS_ALREADY_TAKEN", null)._tag).toBe(
      "UsernameAlreadyExists",
    );
  });

  it("ユーザー名の形式エラーを InvalidUsername に写像する", () => {
    for (const code of [
      "USERNAME_TOO_SHORT",
      "USERNAME_TOO_LONG",
      "INVALID_USERNAME",
    ]) {
      expect(toAuthError(code, null)._tag).toBe("InvalidUsername");
    }
  });

  it("FAILED_TO_CREATE_USER は UnexpectedAuthError になる", () => {
    // プラグイン導入前は username 重複の唯一の経路だったが、今は
    // USERNAME_IS_ALREADY_TAKEN が先に返る。原因を断定できないので
    // 一般形に戻す。
    expect(toAuthError("FAILED_TO_CREATE_USER", null)._tag).toBe(
      "UnexpectedAuthError",
    );
  });

  it("EMAIL_NOT_VERIFIED を EmailNotVerified に写像する", () => {
    // requireEmailVerification により、仮登録のままのサインインはこのコードで返る。
    expect(toAuthError("EMAIL_NOT_VERIFIED", null)._tag).toBe(
      "EmailNotVerified",
    );
  });

  it("未知のコードは UnexpectedAuthError になる", () => {
    const error = toAuthError("SOMETHING_WE_DO_NOT_HANDLE", null);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("SOMETHING_WE_DO_NOT_HANDLE");
  });

  it("コードが undefined でも UnexpectedAuthError になり code は UNKNOWN になる", () => {
    const cause = new Error("network down");
    const error = toAuthError(undefined, cause);
    expect(error._tag).toBe("UnexpectedAuthError");
    expect(error.code).toBe("UNKNOWN");
    expect(error).toHaveProperty("reason", cause);
  });

  it("元のコードを保持する", () => {
    expect(toAuthError("PASSWORD_TOO_SHORT", null).code).toBe(
      "PASSWORD_TOO_SHORT",
    );
  });

  it.each([
    ["INVALID_PASSWORD", "InvalidPassword"],
    ["PASSWORD_ALREADY_SET", "PasswordAlreadySet"],
    ["SESSION_NOT_FRESH", "SessionNotFresh"],
    ["UNAUTHORIZED", "SessionExpired"],
    ["FAILED_TO_UNLINK_LAST_ACCOUNT", "LastAccountUnlinkForbidden"],
    ["ACCOUNT_NOT_FOUND", "AccountNotFound"],
  ])("%s を %s に写像する", (code, tag) => {
    expect(toAuthError(code, undefined)._tag).toBe(tag);
  });

  it("写像したコードを保持する（元のコードを追えるようにするため）", () => {
    expect(toAuthError("SESSION_NOT_FRESH", undefined)).toMatchObject({
      code: "SESSION_NOT_FRESH",
    });
  });

  it("INVALID_TOKEN を InvalidResetToken に写す", () => {
    const error = toAuthError("INVALID_TOKEN", undefined);
    expect(error._tag).toBe("InvalidResetToken");
    expect(error).toMatchObject({ code: "INVALID_TOKEN" });
  });
});
