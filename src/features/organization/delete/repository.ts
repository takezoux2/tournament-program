import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";

export type DeleteOrganizationPort = (input: {
  organizationId: string;
}) => Effect.Effect<void, OrganizationError>;

export const deleteOrganizationInDb: DeleteOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      await prisma.organization.delete({ where: { id: input.organizationId } });
    },
    catch: (reason) => toOrganizationError(reason, ""),
  });
