import { isAPIError } from "better-auth/api";
import { Effect } from "effect";
import { type AuthError, toAuthError } from "@/shared/errors/auth-error";

/**
 * Better Auth のクライアントメソッドが満たす最小の形。
 * 実体を引数で受けることで、テストから Better Auth 本体を呼ばずに分岐を検証できる。
 */
export type AuthCallPort<I> = (
  input: I,
) => Promise<{ error?: { code?: string } | null }>;

/**
 * Better Auth の呼び出しを Effect に包み、失敗を AuthError に揃える。
 * Better Auth のクライアントは例外を投げずに { error } を返すため、
 * reject と error の 2 経路をここで 1 つに畳む。
 */
export const runAuthCall = <I>(
  port: AuthCallPort<I>,
  input: I,
): Effect.Effect<void, AuthError> =>
  Effect.tryPromise({
    try: () => port(input),
    // ネットワーク断などで Promise 自体が reject した場合。コードは無い。
    catch: (cause) => toAuthError(undefined, cause),
  }).pipe(
    Effect.flatMap((result) =>
      result.error
        ? Effect.fail(toAuthError(result.error.code, result.error))
        : Effect.void,
    ),
  );

/**
 * サーバ側の `auth.api.*` が満たす形。クライアントの authClient と違って
 * 解決値をそのまま返し、失敗は APIError の throw で伝える。
 */
export type AuthApiPort<I, A> = (input: I) => Promise<A>;

/**
 * `auth.api.*` の呼び出しを Effect に包み、失敗を AuthError に揃える。
 *
 * runAuthCall（クライアント用）と分けているのは、失敗の伝え方が違うため。
 * クライアントは `{ error }` を返し、サーバは APIError を throw する。
 * 1 つの関数で両方を受けようとすると、どちらの経路も曖昧になる。
 *
 * 解決値を捨てずに返すのは、link-social が遷移先の url を返すため。
 * 値が要らない呼び出し側は無視すればよい。
 */
export const runAuthApiCall = <I, A>(
  port: AuthApiPort<I, A>,
  input: I,
): Effect.Effect<A, AuthError> =>
  Effect.tryPromise({
    try: () => port(input),
    catch: (cause) => {
      if (!isAPIError(cause)) {
        // ネットワーク断やアダプタの不具合。コードは無い。
        return toAuthError(undefined, cause);
      }
      // better-call の APIError は body に { message, code } を持つ。
      // BASE_ERROR_CODES の値が { code, message } の形なので、
      // APIError.from を通ったものは必ず code を持つ。
      const code = (cause as { body?: { code?: unknown } }).body?.code;
      return toAuthError(typeof code === "string" ? code : undefined, cause);
    },
  });
