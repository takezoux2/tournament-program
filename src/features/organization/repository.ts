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

export type MemberSummary = {
  id: string;
  name: string;
  nameKana: string;
};

/**
 * 組織のメンバーを読み順で返す。エントリー追加の選択肢に使う。
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

export type MembershipSummary = {
  id: string;
  name: string;
  slug: string;
  joinedAt: Date;
  permissions: { code: string; description: string }[];
};

/**
 * ユーザーの所属を、その組織で持つ権限つきで参加順に返す。
 * プロフィールの「所属組織」画面が使う。
 *
 * listOrganizationsForUser（トップの移動用一覧）と分けているのは、
 * あちらが移動のための最小限で、権限まで引くと全ページで無駄な結合が
 * 増えるため。用途が違えばクエリも分ける。
 *
 * 絞り込みは userId を where に入れることそのもの。所属していない組織は
 * そもそも返らないので、この関数自体が境界になる。
 */
export const listMembershipsForUser = async (
  userId: string,
): Promise<MembershipSummary[]> => {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: {
      joinedAt: true,
      organization: { select: { id: true, name: true, slug: true } },
      permissions: {
        select: { permission: { select: { code: true, description: true } } },
      },
    },
  });

  return memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    joinedAt: membership.joinedAt,
    permissions: membership.permissions.map((grant) => ({
      code: grant.permission.code,
      description: grant.permission.description,
    })),
  }));
};
