import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { LoginInput } from "./schema";

/** authClient.signIn.email が満たす最小の形。 */
export type SignInPort = AuthCallPort<LoginInput>;

export const login = (
  port: SignInPort,
  input: LoginInput,
): Effect.Effect<void, AuthError> => runAuthCall(port, input);
