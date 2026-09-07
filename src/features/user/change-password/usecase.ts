import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { ChangePasswordInput } from "./schema";

/** auth.api.changePassword が満たす最小の形。 */
export type ChangePasswordPort = AuthApiPort<
  {
    body: { currentPassword: string; newPassword: string };
    headers: Headers;
  },
  unknown
>;

/**
 * 他端末のセッションは破棄しない（revokeOtherSessions を渡さない）。
 * 破棄したい場合の明示的な操作を features/user/revoke-sessions が持っており、
 * 副作用としてここに埋め込むと「変更したら勝手に他の端末が落ちた」ことになる。
 */
export const changePassword = (
  port: ChangePasswordPort,
  input: ChangePasswordInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
    headers,
  });
