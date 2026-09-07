import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";

/** auth.api.deleteUser が満たす最小の形。 */
export type DeleteAccountPort = AuthApiPort<
  { body: { callbackURL: string }; headers: Headers },
  unknown
>;

/**
 * 削除そのものはここでは起きない。sendDeleteAccountVerification が
 * 設定されているため、この呼び出しは確認メールの送信で終わる。
 * callbackURL はリンクを踏んで削除が完了した後の戻り先で、
 * その時点でセッションは消えているのでログイン画面へ送る。
 */
export const deleteAccount = (
  port: DeleteAccountPort,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { callbackURL: "/login" }, headers });
