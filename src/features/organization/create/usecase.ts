import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { CreateOrganizationPort } from "./repository";
import type { CreateOrganizationInput } from "./schema";

/**
 * port を引数で受けるのは、テストで DB を差し替えられるようにするため。
 * 既存の features/auth/login/usecase.ts と同じ形にしている。
 */
export const createOrganization = (
  port: CreateOrganizationPort,
  input: CreateOrganizationInput,
  ownerUserId: string,
): Effect.Effect<{ slug: string }, OrganizationError> =>
  port({ ...input, ownerUserId });
