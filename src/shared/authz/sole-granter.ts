import "server-only";
import { prisma } from "@/shared/db/prisma";
import type { PermissionCode } from "./ability";

/**
 * 権限を配れる唯一のコード。これを持つ人が組織から居なくなると、
 * その組織では以後だれも権限を付与できなくなる。
 */
const GRANT_PERMISSION_CODE: PermissionCode = "user.grant";

export type SoleGranterOrganization = {
  id: string;
  name: string;
  slug: string;
};

/**
 * そのユーザーが「唯一の user.grant 保持者」である組織を返す。
 *
 * OrganizationUser は onDelete: Cascade なので、ユーザーを消すと所属も権限も
 * 黙って消える。ここに該当する組織が 1 つでもあれば、削除を通した瞬間に
 * その組織は誰も権限を配れない状態になり、アプリの中からは直せなくなる。
 *
 * 置き場所が shared/authz なのは、features/user の Server Action と
 * shared/lib/auth.ts の beforeDelete フックの両方から使うため。
 * shared は @/features/** を import できないので、features 側には置けない。
 * 権限コードを所有するのもここ（ability.ts）なので、位置としても素直。
 */
export const findSoleGranterOrganizations = async (
  userId: string,
): Promise<SoleGranterOrganization[]> => {
  const ownGrants = await prisma.organizationUserPermission.findMany({
    where: { userId, permission: { code: GRANT_PERMISSION_CODE } },
    select: { organizationId: true },
  });

  const organizationIds = ownGrants.map((grant) => grant.organizationId);
  if (organizationIds.length === 0) {
    return [];
  }

  // 自分以外の保持者を数える。userId: { not } を where に入れることで、
  // 取得してから自分を除く形にしない。
  const otherGrants = await prisma.organizationUserPermission.findMany({
    where: {
      organizationId: { in: organizationIds },
      permission: { code: GRANT_PERMISSION_CODE },
      userId: { not: userId },
    },
    select: { organizationId: true },
  });

  const hasOtherGranter = new Set(
    otherGrants.map((grant) => grant.organizationId),
  );
  const soleIds = organizationIds.filter((id) => !hasOtherGranter.has(id));
  if (soleIds.length === 0) {
    return [];
  }

  return prisma.organization.findMany({
    where: { id: { in: soleIds } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
};
