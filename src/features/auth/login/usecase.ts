import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { LoginInput } from "./schema";

/** authClient.signIn.email へ実際に渡す値。callbackURL は再送メールの戻り先。 */
export type LoginCall = LoginInput & { callbackURL: string };

/** authClient.signIn.email が満たす最小の形。 */
export type SignInPort = AuthCallPort<LoginCall>;

export const login = (
  port: SignInPort,
  input: LoginInput,
  callbackURL: string,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, { ...input, callbackURL });
