import type { Effect } from "effect";
import type { OrganizationUserError } from "../errors";
import type { GrantPermissionsPort } from "./repository";
import type { GrantPermissionsInput } from "./schema";

export const grantPermissions = (
  port: GrantPermissionsPort,
  input: GrantPermissionsInput,
  organizationId: string,
): Effect.Effect<{ updated: number }, OrganizationUserError> =>
  port({ ...input, organizationId });
