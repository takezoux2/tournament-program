import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type AddUserPort = (input: {
  userId: string;
  organizationId: string;
  /** 追加を実行した人が今 持っている権限コード。これを超える権限は渡らない。 */
  granterCodes: readonly string[];
}) => Effect.Effect<void, OrganizationUserError>;

export const addUserInDb: AddUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 追加者が持つコードだけに絞る。Permission 表との積になるので、
      // 存在しないコードが混じっても付与は増えない。
      const permissions = await prisma.permission.findMany({
        where: { code: { in: [...input.granterCodes] } },
        select: { id: true },
      });

      // 所属行と権限は必ず同時に作る。分けると、権限を持たないまま
      // 何もできないユーザーが残り得る。
      await prisma.organizationUser.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          // 追加されたユーザーは追加者の権限だけを引き継ぐ。
          // 自分より強いメンバーを作れないようにするため。
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
