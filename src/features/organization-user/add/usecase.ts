import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { AddUserPort } from "./repository";
import type { AddUserInput } from "./schema";

/**
 * granterCodes は追加を実行した人が今 持っている権限コード。
 * 新しいメンバーはこれだけを引き継ぐので、自分より強いメンバーは作れない。
 */
export const addUser = (
  port: AddUserPort,
  input: AddUserInput,
  organizationId: string,
  granterCodes: readonly string[],
): Effect.Effect<void, OrganizationUserError> =>
  port({ ...input, organizationId, granterCodes });
