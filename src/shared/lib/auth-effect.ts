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
