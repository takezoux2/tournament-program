import { Data } from "effect";

export class InvalidCredentials extends Data.TaggedError("InvalidCredentials")<{
  readonly code: string;
}> {}

export class EmailAlreadyExists extends Data.TaggedError("EmailAlreadyExists")<{
  readonly code: string;
}> {}

export class WeakPassword extends Data.TaggedError("WeakPassword")<{
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
  | WeakPassword
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
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return new InvalidCredentials({ code });
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return new EmailAlreadyExists({ code });
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return new WeakPassword({ code });
    default:
      return new UnexpectedAuthError({
        code: code ?? "UNKNOWN",
        reason: cause,
      });
  }
};
