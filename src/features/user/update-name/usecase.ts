import type { Effect } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import type { UpdateNameInput } from "./schema";

/**
 * auth.api.updateUser が満たす最小の形。実体を引数で受けることで、
 * Better Auth 本体を呼ばずに分岐を検証できる。
 * repository.ts を置かないのは、認証テーブルへの書き込みを Better Auth の
 * アダプタが所有しているため（architecture.md の features/auth の例外と同じ）。
 */
export type UpdateNamePort = AuthApiPort<
  { body: { name: string }; headers: Headers },
  unknown
>;

export const updateName = (
  port: UpdateNamePort,
  input: UpdateNameInput,
  headers: Headers,
): Effect.Effect<unknown, AuthError> =>
  runAuthApiCall(port, { body: { name: input.name }, headers });
