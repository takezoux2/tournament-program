import { notFound } from "next/navigation";
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
    include: { organization: true },
  });

  // 非所属を 403 ではなく 404 にするのは、組織の存在自体を漏らさないため。
  if (!membership) {
    notFound();
  }

  return {
    session,
    organization: membership.organization,
    role: membership.role,
  };
};
