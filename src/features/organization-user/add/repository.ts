import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type AddUserPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<void, OrganizationUserError>;

export const addUserInDb: AddUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      const permissions = await prisma.permission.findMany({
        select: { id: true },
      });

      // 所属行と権限は必ず同時に作る。分けると、権限を持たないまま
      // 何もできないユーザーが残り得る。
      await prisma.organizationUser.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          // 設計どおり、追加されたユーザーには全権限を付与する。
          permissions: {
            create: permissions.map((permission) => ({
              permissionId: permission.id,
            })),
          },
        },
      });
    },
    catch: (reason) => toOrganizationUserError(reason, input.userId),
  });
