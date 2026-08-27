import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { SignupInput } from "./schema";

/** authClient.signUp.email が満たす最小の形。 */
export type SignUpPort = AuthCallPort<SignupInput>;

export const signup = (
  port: SignUpPort,
  input: SignupInput,
): Effect.Effect<void, AuthError> => runAuthCall(port, input);
