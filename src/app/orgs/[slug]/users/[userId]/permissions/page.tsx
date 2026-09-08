import { notFound } from "next/navigation";
import { AppHeader, type Crumb } from "@/components/layout/AppHeader";
import { PermissionEditForm } from "@/components/organization-user/PermissionEditForm";
import { grantPermissionsAction } from "@/features/organization-user/grant/handler";
import {
  findOrganizationUser,
  listAllPermissions,
} from "@/features/organization-user/repository";
import { canByCode } from "@/shared/authz/ability";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function PermissionsPage({
  params,
}: PageProps<"/orgs/[slug]/users/[userId]/permissions">) {
  const { slug, userId } = await params;
  const { session, organization, ability } = await requirePermission(
    slug,
    "user.grant",
  );
  // 一覧（/orgs/[slug]/users）は user.view を要求する。無い場合はパンくずを
  // リンクにしない（キャンセル・保存後リダイレクトと同じ理由。domain.ts 参照）。
  const canViewUsers = canByCode(ability, "user.view");

  const [target, permissions] = await Promise.all([
    findOrganizationUser(organization.id, userId),
    listAllPermissions(),
  ]);

  // 所属していない相手の権限は編集させない。存在を漏らさないよう 404。
  if (target === null) {
    notFound();
  }

  const crumbs: Crumb[] = [
    { label: "組織", href: "/" },
    { label: organization.name, href: `/orgs/${slug}` },
    canViewUsers
      ? { label: "ユーザー", href: `/orgs/${slug}/users` }
      : { label: "ユーザー" },
    { label: target.name },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={crumbs}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">権限を編集</h1>

        <PermissionEditForm
          slug={slug}
          user={target}
          permissions={permissions}
          isSelf={target.userId === session.user.id}
          canViewUsers={canViewUsers}
          action={grantPermissionsAction}
        />
      </div>
    </main>
  );
}
