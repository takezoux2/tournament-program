import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { normalizeEmail } from "@/shared/lib/email";
import { normalizeUsername } from "@/shared/lib/username";
import {
  type OrganizationUserError,
  toOrganizationUserError,
  UserNotFound,
} from "../errors";
import type { FoundUser } from "../state";

export type SearchUserPort = (input: {
  query: string;
  organizationId: string;
}) => Effect.Effect<FoundUser, OrganizationUserError>;

/**
 * username / email はどちらも unique なので、完全一致なら候補は最大 1 件。
 * 部分一致にしないのは、無関係なユーザーの存在を列挙させないため。
 */
export const searchUserInDb: SearchUserPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            // username は小文字で保存されるので、検索語も小文字に揃える。
            // 揃えないと Takezo と打った管理者が takezo を見つけられない。
            { username: normalizeUsername(input.query) },
            { email: normalizeEmail(input.query) },
          ],
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          image: true,
          // 所属済みかどうかを同じクエリで取る。organizationId で絞らないと
          // 他組織の所属を「所属済み」と誤判定する。
          memberships: {
            where: { organizationId: input.organizationId },
            select: { userId: true },
          },
        },
      });

      if (user === null) {
        throw new UserNotFound({ query: input.query });
      }

      return {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        image: user.image,
        alreadyMember: user.memberships.length > 0,
      };
    },
    catch: (reason) =>
      // UserNotFound は自分で投げた制御用の値なので、そのまま通す。
      reason instanceof UserNotFound
        ? reason
        : toOrganizationUserError(reason, input.query),
  });
