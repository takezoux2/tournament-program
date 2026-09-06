import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthCallPort, runAuthCall } from "@/shared/lib/auth-effect";
import type { LoginInput } from "./schema";

/** authClient.signIn.email へ実際に渡す値。callbackURL は再送メールの戻り先。 */
export type SignInEmailCall = {
  readonly email: string;
  readonly password: string;
  readonly callbackURL: string;
};

/** authClient.signIn.username へ実際に渡す値。 */
export type SignInUsernameCall = {
  readonly username: string;
  readonly password: string;
  readonly callbackURL: string;
};

/**
 * サインインの 2 経路。実体を引数で受けることで、テストから
 * Better Auth 本体を呼ばずに振り分けを検証できる。
 */
export type LoginPorts = {
  readonly signInEmail: AuthCallPort<SignInEmailCall>;
  readonly signInUsername: AuthCallPort<SignInUsernameCall>;
};

/**
 * 識別子の種別でサインインの口を選ぶ。
 *
 * /sign-in/username は /sign-in/email と同じ実装で requireEmailVerification と
 * sendOnSignIn を扱うため、未確認メールの再送はどちらの経路でも同じように起きる。
 */
export const login = (
  ports: LoginPorts,
  input: LoginInput,
  callbackURL: string,
): Effect.Effect<void, AuthError> =>
  input.identifier.kind === "email"
    ? runAuthCall(ports.signInEmail, {
        email: input.identifier.email,
        password: input.password,
        callbackURL,
      })
    : runAuthCall(ports.signInUsername, {
        username: input.identifier.username,
        password: input.password,
        callbackURL,
      });
