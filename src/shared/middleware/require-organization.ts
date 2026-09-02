import { notFound } from "next/navigation";
import {
  type AppAbility,
  canByCode,
  defineAbilityFor,
  type PermissionCode,
} from "@/shared/authz/ability";
import { prisma } from "@/shared/db/prisma";
import { requireSession } from "./require-session";

/**
 * 組織スコープの実際のセキュリティ境界。/orgs/[slug] 配下の Server Component と
 * Server Action の冒頭で必ず呼ぶ。ページで確認済みでも Server Action は
 * 独立した入口であり、素通しにはできない。
 */
export const requireOrganization = async (slug: string) => {
  const session = await requireSession();

  const membership = await prisma.organizationUser.findFirst({
    where: { organization: { slug }, userId: session.user.id },
    include: {
      organization: true,
      permissions: { include: { permission: true } },
    },
  });

  // 非所属を 403 ではなく 404 にするのは、組織の存在自体を漏らさないため。
  if (!membership) {
    notFound();
  }

  const permissionCodes = membership.permissions.map(
    (grant) => grant.permission.code,
  );

  return {
    session,
    organization: membership.organization,
    permissionCodes,
    ability: defineAbilityFor(permissionCodes),
  };
};

export type OrganizationContext = Awaited<
  ReturnType<typeof requireOrganization>
>;

/**
 * 所属に加えて特定の権限も要る場合の境界。権限が無い場合も notFound にするのは、
 * 「権限が無い」と「そもそも無い」を区別させないため（requireOrganization と同じ方針）。
 */
export const requirePermission = async (
  slug: string,
  code: PermissionCode,
): Promise<OrganizationContext> => {
  const context = await requireOrganization(slug);

  if (!canByCode(context.ability, code)) {
    notFound();
  }

  return context;
};

export type { AppAbility };
