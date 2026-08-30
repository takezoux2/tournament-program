import type { Effect } from "effect";
import type { OrganizationError } from "../errors";
import type { DeleteOrganizationPort } from "./repository";

export const deleteOrganization = (
  port: DeleteOrganizationPort,
  organizationId: string,
): Effect.Effect<{ deleted: number }, OrganizationError> =>
  port({ organizationId });
