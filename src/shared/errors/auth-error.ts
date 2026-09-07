import { Data } from "effect";

export class InvalidCredentials extends Data.TaggedError("InvalidCredentials")<{
  readonly code: string;
}> {}

export class EmailAlreadyExists extends Data.TaggedError("EmailAlreadyExists")<{
  readonly code: string;
}> {}

export class UsernameAlreadyExists extends Data.TaggedError(
  "UsernameAlreadyExists",
)<{
  readonly code: string;
}> {}

export class InvalidUsername extends Data.TaggedError("InvalidUsername")<{
  readonly code: string;
}> {}

export class WeakPassword extends Data.TaggedError("WeakPassword")<{
  readonly code: string;
}> {}

export class EmailNotVerified extends Data.TaggedError("EmailNotVerified")<{
  readonly code: string;
}> {}

/**
 * パスワードリセットのトークンが無効・期限切れ・使用済みのときに返る。
 *
 * Better Auth の INVALID_TOKEN は汎用のコードだが、この repo で
 * クライアントからこのコードを受け取りうる経路は今のところリセットだけ。
 * 確認メールの失敗は callbackURL の ?error= で返るため、この写像は通らない。
 */
export class InvalidResetToken extends Data.TaggedError("InvalidResetToken")<{
  readonly code: string;
}> {}

export class UnexpectedAuthError extends Data.TaggedError(
  "UnexpectedAuthError",
)<{
  readonly code: string;
  // Error が持つ cause と名前が衝突しないよう reason にしている。
  readonly reason: unknown;
}> {}

export type AuthError =
  | InvalidCredentials
  | EmailAlreadyExists
  | UsernameAlreadyExists
  | InvalidUsername
  | WeakPassword
  | EmailNotVerified
  | InvalidResetToken
  | UnexpectedAuthError;

/**
 * Better Auth のエラーコードを AuthError に写像する。
 * コード文字列は @better-auth/core の BASE_ERROR_CODES のキー名と一致する。
 * 未知のコードを握り潰さず UnexpectedAuthError として残すことで、
 * ライブラリ更新でコードが増えたときに元のコードが追える。
 */
export const toAuthError = (
  code: string | undefined,
  cause: unknown,
): AuthError => {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return new InvalidCredentials({ code });
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return new EmailAlreadyExists({ code });
    // username プラグインが /sign-up/email の前段で重複を弾いたときのコード。
    // 以前は Prisma の P2002 が FAILED_TO_CREATE_USER として返るのを重複と
    // 見なしていたが、今は原因を推測せずに済む。
    case "USERNAME_IS_ALREADY_TAKEN":
      return new UsernameAlreadyExists({ code });
    // クライアント側の検証を通さない直接 POST か、プラグインのオプションが
    // usernameSchema からずれたときに返る。
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return new InvalidUsername({ code });
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return new WeakPassword({ code });
    // requireEmailVerification が有効なとき、仮登録のままのサインインで返る。
    // Better Auth はこの応答と同時に確認メールを送り直す（sendOnSignIn）。
    case "EMAIL_NOT_VERIFIED":
      return new EmailNotVerified({ code });
    // reset-password のトークンが無効・期限切れ・使用済みのとき。
    // Better Auth はこの 3 つを区別せずに返す（api/routes/password.mjs）。
    case "INVALID_TOKEN":
      return new InvalidResetToken({ code });
    default:
      return new UnexpectedAuthError({
        code: code ?? "UNKNOWN",
        reason: cause,
      });
  }
};
