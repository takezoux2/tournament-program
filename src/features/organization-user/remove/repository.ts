import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type OrganizationUserError, toOrganizationUserError } from "../errors";

export type RemoveUserPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<{ removed: number }, OrganizationUserError>;

/**
 * 組織内の user.grant 保持者の状況を返す。判断そのものは usecase の仕事なので、
 * ここでは事実（対象が保持しているか／対象以外に何人いるか）だけを返す。
 */
export type CountGrantHoldersPort = (input: {
  userId: string;
  organizationId: string;
}) => Effect.Effect<
  { targetHolds: boolean; otherHolders: number },
  OrganizationUserError
>;

export const countGrantHoldersInDb: CountGrantHoldersPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 2 件取れれば対象以外に必ず 1 人いると分かる。1 件以下しか返らなければ
      // それが全件なので、「対象が最後の 1 人か」も同じ 1 クエリで確定する。
      const holders = await prisma.organizationUserPermission.findMany({
        where: {
          organizationId: input.organizationId,
          permission: { code: "user.grant" },
        },
        select: { userId: true },
        take: 2,
      });

      return {
        targetHolds: holders.some((row) => row.userId === input.userId),
        otherHolders: holders.filter((row) => row.userId !== input.userId)
          .length,
      };
    },
    catch: (reason) => toOrganizationUserError(reason, input.userId),
  });

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
