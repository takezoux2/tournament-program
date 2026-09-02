import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type RemoveUserPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<{ removed: number }, OrganizationUserError>;

export const removeUserInDb: RemoveUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // deleteMany を使うのは、所有権を where に残したまま件数を取るため。
      // 権限行は OrganizationUserPermission の onDelete: Cascade で一緒に消える。
      const result = await prisma.organizationUser.deleteMany({
        where: { organizationId: input.organizationId, userId: input.userId },
      });
      return { removed: result.count };
    },
    catch: (reason) => toOrganizationUserError(reason, input.userId),
  });
