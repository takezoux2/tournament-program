import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { SignupInput } from "./schema";

/**
 * authClient.signUp.email へ実際に渡す値。
 * callbackURL は確認メールのリンクに埋め込まれる遷移先で、入力欄の値ではない。
 * そのため schema.ts には入れず、画面から usecase の引数として受け取る。
 */
export type SignupCall = SignupInput & { callbackURL: string };

/** authClient.signUp.email が満たす最小の形。 */
export type SignUpPort = AuthCallPort<SignupCall>;

export const signup = (
  port: SignUpPort,
  input: SignupInput,
  callbackURL: string,
): Effect.Effect<void, AuthError> =>
  runAuthCall(port, { ...input, callbackURL });
