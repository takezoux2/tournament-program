import "server-only";
import { prisma } from "@/shared/db/prisma";

export type OrganizationUserSummary = {
  userId: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  permissionCodes: string[];
  joinedAt: Date;
};

export type PermissionSummary = {
  id: number;
  code: string;
  description: string;
};

/** 所属行 1 件を画面用の形に均す。findMany と findFirst で同じ形にするため切り出す。 */
type MembershipRow = {
  joinedAt: Date;
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    image: string | null;
  };
  permissions: { permission: { code: string } }[];
};

const toSummary = (row: MembershipRow): OrganizationUserSummary => ({
  userId: row.user.id,
  name: row.user.name,
  username: row.user.username,
  email: row.user.email,
  image: row.user.image,
  permissionCodes: row.permissions.map((grant) => grant.permission.code),
  joinedAt: row.joinedAt,
});

const MEMBERSHIP_SELECT = {
  joinedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
    },
  },
  permissions: { select: { permission: { select: { code: true } } } },
} as const;

/**
 * 組織に所属するユーザーを参加順に返す。
 * organizationId を where に入れるのが横断アクセス防止の要。
 */
export const listUsersInOrganization = async (
  organizationId: string,
): Promise<OrganizationUserSummary[]> => {
  const rows = await prisma.organizationUser.findMany({
    where: { organizationId },
    orderBy: { joinedAt: "asc" },
    select: MEMBERSHIP_SELECT,
  });

  return rows.map(toSummary);
};

/**
 * 権限マスタの全件。並びは migration のシード順（= id 昇順）に固定する。
 * 画面のチェックボックスの並びが実行のたびに変わらないようにするため。
 */
export const listAllPermissions = (): Promise<PermissionSummary[]> =>
  prisma.permission.findMany({
    orderBy: { id: "asc" },
    select: { id: true, code: true, description: true },
  });

/** 権限編集ページ用。組織に属していなければ null。 */
export const findOrganizationUser = async (
  organizationId: string,
  userId: string,
): Promise<OrganizationUserSummary | null> => {
  const row = await prisma.organizationUser.findFirst({
    where: { organizationId, userId },
    select: MEMBERSHIP_SELECT,
  });

  return row === null ? null : toSummary(row);
};
