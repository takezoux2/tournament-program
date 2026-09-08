import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { SetPasswordInput } from "./schema";

/**
 * auth.api.setPassword が満たす最小の形。
 *
 * setPassword は createAuthEndpoint.serverOnly で定義されており、HTTP の
 * ルートに出ない。authClient からは呼べないため、Server Action から
 * auth.api を叩く以外の手段が無い。
 */
export type SetPasswordPort = AuthApiPort<
  { body: { newPassword: string }; headers: Headers },
  unknown
>;

export const setPassword = (
  port: SetPasswordPort,
  input: SetPasswordInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, {
    body: { newPassword: input.newPassword },
    headers,
  });
