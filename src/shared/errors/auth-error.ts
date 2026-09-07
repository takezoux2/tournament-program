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

/** 現在のパスワードが違う。changePassword / deleteUser で返る。 */
export class InvalidPassword extends Data.TaggedError("InvalidPassword")<{
  readonly code: string;
}> {}

/** 既にパスワードが設定済み。setPassword は上書きを拒む。 */
export class PasswordAlreadySet extends Data.TaggedError("PasswordAlreadySet")<{
  readonly code: string;
}> {}

/**
 * セッションが古い。unlinkAccount が freshSessionMiddleware を使っており、
 * セッション作成から session.freshAge（既定 24 時間）を過ぎると返る。
 */
export class SessionNotFresh extends Data.TaggedError("SessionNotFresh")<{
  readonly code: string;
}> {}

/**
 * 最後の 1 つの認証方法は解除できない。これがあるおかげで、パスワード未設定の
 * まま Google 連携を外して締め出される経路が存在しない。
 */
export class LastAccountUnlinkForbidden extends Data.TaggedError(
  "LastAccountUnlinkForbidden",
)<{
  readonly code: string;
}> {}

/** 解除しようとした連携が見つからない。 */
export class AccountNotFound extends Data.TaggedError("AccountNotFound")<{
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
  | InvalidPassword
  | PasswordAlreadySet
  | SessionNotFresh
  | LastAccountUnlinkForbidden
  | AccountNotFound
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
    // ここから下はプロフィール画面（features/user）の経路で返るコード。
    // ログイン・登録では起きないが、写像は 1 か所にまとめておく。
    case "INVALID_PASSWORD":
      return new InvalidPassword({ code });
    case "PASSWORD_ALREADY_SET":
      return new PasswordAlreadySet({ code });
    case "SESSION_NOT_FRESH":
      return new SessionNotFresh({ code });
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return new LastAccountUnlinkForbidden({ code });
    case "ACCOUNT_NOT_FOUND":
      return new AccountNotFound({ code });
    default:
      return new UnexpectedAuthError({
        code: code ?? "UNKNOWN",
        reason: cause,
      });
  }
};
