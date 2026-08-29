import "server-only";
import { prisma } from "@/shared/db/prisma";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

/**
 * ユーザーが所属する組織を参加した順に返す。
 * 所属していない組織はそもそも返さないため、この関数自体が絞り込みの境界になる。
 */
export const listOrganizationsForUser = async (
  userId: string,
): Promise<OrganizationSummary[]> => {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return memberships.map((membership) => membership.organization);
};
