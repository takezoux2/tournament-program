import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  NotAMember,
  type OrganizationUserError,
  toOrganizationUserError,
} from "../errors";

export type GrantPermissionsPort = (input: {
  userId: string;
  organizationId: string;
  codes: string[];
}) => Effect.Effect<{ updated: number }, OrganizationUserError>;

/**
 * 差分を計算せず、まとめて消してから入れ直す。チェックボックスの状態が
 * そのまま「あるべき権限の全体」なので、差分計算は状態を増やすだけになる。
 */
export const grantPermissionsInDb: GrantPermissionsPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx) => {
        // 所有権のチェック。organizationId を where に含めることで、
        // 他組織のユーザーの権限を書き換えられない。
        const membership = await tx.organizationUser.findFirst({
          where: { organizationId: input.organizationId, userId: input.userId },
          select: { userId: true },
        });
        if (membership === null) {
          throw new NotAMember({ userId: input.userId });
        }

        const permissions = await tx.permission.findMany({
          where: { code: { in: input.codes } },
          select: { id: true, code: true },
        });

        // 消して入れ直すのを 1 トランザクションに閉じる。分けると、
        // 権限が空のまま見える瞬間ができる。
        await tx.organizationUserPermission.deleteMany({
          where: { organizationId: input.organizationId, userId: input.userId },
        });

        if (permissions.length > 0) {
          await tx.organizationUserPermission.createMany({
            data: permissions.map((permission) => ({
              organizationId: input.organizationId,
              userId: input.userId,
              permissionId: permission.id,
            })),
          });
        }

        return { updated: 1 };
      }),
    catch: (reason) =>
      // NotAMember は自分で投げた制御用の値なので、そのまま通す。
      reason instanceof NotAMember
        ? reason
        : toOrganizationUserError(reason, input.userId),
  });
