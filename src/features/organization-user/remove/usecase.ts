import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { RemoveUserPort } from "./repository";
import type { RemoveUserInput } from "./schema";

export const removeUser = (
  port: RemoveUserPort,
  input: RemoveUserInput,
  organizationId: string,
): Effect.Effect<{ removed: number }, OrganizationUserError> =>
  port({ ...input, organizationId });
