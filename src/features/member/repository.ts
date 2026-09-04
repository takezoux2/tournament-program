import "server-only";
import { prisma } from "@/shared/db/prisma";

export type MemberSummary = {
  id: string;
  name: string;
  nameKana: string;
};

/**
 * 組織のメンバーを読み順で返す。
 * Member は組織スコープなので、organizationId が絞り込みの境界そのものになる。
 */
export const listMembersInOrganization = (
  organizationId: string,
): Promise<MemberSummary[]> =>
  prisma.member.findMany({
    where: { organizationId },
    orderBy: { nameKana: "asc" },
    select: { id: true, name: true, nameKana: true },
  });
