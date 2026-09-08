import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import { EMAIL_CHANGE_CALLBACK_URL } from "@/shared/lib/auth-email-change-email";
import type { ChangeEmailInput } from "./schema";

/** auth.api.changeEmail が満たす最小の形。 */
export type ChangeEmailPort = AuthApiPort<
  {
    body: { newEmail: string; callbackURL: string };
    headers: Headers;
  },
  unknown
>;

/**
 * callbackURL は入力欄の値ではなく、確認リンクを踏んだ後の戻り先。
 * signup の verificationCallbackURL と同じ立場で、schema には入れない。
 * この値は確認メールの文面の出し分けにも使われる（auth.ts のフックが
 * isEmailChangeVerification でこれを見る）。
 */
export const changeEmail = (
  port: ChangeEmailPort,
  input: ChangeEmailInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: {
      newEmail: input.newEmail,
      callbackURL: EMAIL_CHANGE_CALLBACK_URL,
    },
    headers,
  });
