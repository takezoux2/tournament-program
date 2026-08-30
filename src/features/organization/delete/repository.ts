import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationError, toOrganizationError } from "../errors";

export type DeleteOrganizationPort = (input: {
  organizationId: string;
}) => Effect.Effect<{ deleted: number }, OrganizationError>;

export const deleteOrganizationInDb: DeleteOrganizationPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // deleteMany を使うのは件数を取るため。delete だと対象が消えていた場合に
      // P2025 の例外になり、tournament 側（deleteMany の 0 件）と扱いが割れてしまう。
      const result = await prisma.organization.deleteMany({
        where: { id: input.organizationId },
      });
      return { deleted: result.count };
    },
    catch: (reason) => toOrganizationError(reason, ""),
  });
