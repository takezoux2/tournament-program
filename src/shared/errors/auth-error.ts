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
  | UsernameAlreadyExists
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
    // Better Auth はメール重複だけを事前に弾く。username は unique 制約に任せて
    // いるため、重複は internalAdapter.createUser の中で Prisma の P2002 になり、
    // FAILED_TO_CREATE_USER として返る（better-auth/dist/api/routes/sign-up.mjs）。
    // このコードは厳密には「作成に失敗した」一般形だが、signup 経路で現実に
    // 起きるのはほぼ username 重複なので、最も可能性の高い原因として案内する。
    case "FAILED_TO_CREATE_USER":
      return new UsernameAlreadyExists({ code });
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
