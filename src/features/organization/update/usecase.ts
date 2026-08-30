import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { UpdateOrganizationPort } from "./repository";
import type { UpdateOrganizationInput } from "./schema";

export const updateOrganization = (
  port: UpdateOrganizationPort,
  input: UpdateOrganizationInput,
  organizationId: string,
): Effect.Effect<{ updated: number }, OrganizationError> =>
  port({ organizationId, name: input.name });
