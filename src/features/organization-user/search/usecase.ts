import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { FoundUser } from "../state";
import type { SearchUserPort } from "./repository";
import type { SearchUserInput } from "./schema";

/**
 * port を引数で受けるのは、テストで DB を差し替えられるようにするため。
 * 既存の features/organization/create/usecase.ts と同じ形にしている。
 */
export const searchUser = (
  port: SearchUserPort,
  input: SearchUserInput,
  organizationId: string,
): Effect.Effect<FoundUser, OrganizationUserError> =>
  port({ ...input, organizationId });
