import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import { PASSWORD_RESET_REDIRECT_TO } from "./domain";
import type { PasswordResetInput, PasswordResetRequestInput } from "./schema";

/** authClient.requestPasswordReset へ実際に渡す値。 */
export type PasswordResetRequestCall = {
  email: string;
  redirectTo: string;
};

/** authClient.requestPasswordReset が満たす最小の形。 */
export type RequestPasswordResetPort = AuthCallPort<PasswordResetRequestCall>;

/**
 * リセットメールの送信を申し込む。
 *
 * redirectTo を引数で受けずに固定値を使うのは、この値がメール本文の URL に
 * 埋め込まれるためである（domain.ts の PASSWORD_RESET_REDIRECT_TO 参照）。
 *
 * 成功しても、そのメールアドレスのユーザーが居たとは限らない。Better Auth は
 * 列挙対策として不在時もダミーのトークン生成と DB 参照を挟んだ上で同じ応答を
 * 返す。呼び出し側は結果を「送ったかどうか」ではなく「申し込みを受け付けたか
 * どうか」として扱うこと。
 */
export const requestPasswordReset = (
  port: RequestPasswordResetPort,
  input: PasswordResetRequestInput,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, {
    email: input.email,
    redirectTo: PASSWORD_RESET_REDIRECT_TO,
  });

/** authClient.resetPassword へ実際に渡す値。 */
export type PasswordResetCall = {
  newPassword: string;
  token: string;
};

/** authClient.resetPassword が満たす最小の形。 */
export type ResetPasswordPort = AuthCallPort<PasswordResetCall>;

/**
 * 新しいパスワードを設定する。
 * token はメールのリンク経由でクエリに乗ってくる値で、入力欄ではないため
 * schema.ts には入れず引数として受け取る。confirmPassword は画面側の
 * 確認用なので、ここで落としてサーバーへは送らない。
 */
export const resetPassword = (
  port: ResetPasswordPort,
  input: PasswordResetInput,
  token: string,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, { newPassword: input.newPassword, token });
