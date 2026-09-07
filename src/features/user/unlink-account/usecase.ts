import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";

/** auth.api.unlinkAccount が満たす最小の形。 */
export type UnlinkAccountPort = AuthApiPort<
  { body: { accountId: string }; headers: Headers },
  unknown
>;

/**
 * accountId は画面から受け取らず、handler がセッションのユーザーの
 * 連携から引き当てたものを渡す。schema.ts を持たないのはそのため。
 *
 * unlinkAccount は freshSessionMiddleware を使っており、セッション作成から
 * 24 時間を過ぎると SESSION_NOT_FRESH になる。回避できないので、
 * 画面は再ログインを促す文言を出す。
 */
export const unlinkAccount = (
  port: UnlinkAccountPort,
  accountId: string,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { accountId }, headers });
