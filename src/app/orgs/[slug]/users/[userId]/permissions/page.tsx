import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { PermissionEditForm } from "@/components/organization-user/PermissionEditForm";
import { grantPermissionsAction } from "@/features/organization-user/grant/handler";
import {
  findOrganizationUser,
  listAllPermissions,
} from "@/features/organization-user/repository";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function PermissionsPage({
  params,
}: PageProps<"/orgs/[slug]/users/[userId]/permissions">) {
  const { slug, userId } = await params;
  const { session, organization } = await requirePermission(slug, "user.grant");

  const [target, permissions] = await Promise.all([
    findOrganizationUser(organization.id, userId),
    listAllPermissions(),
  ]);

  // 所属していない相手の権限は編集させない。存在を漏らさないよう 404。
  if (target === null) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "ユーザー", href: `/orgs/${slug}/users` },
          { label: target.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">権限を編集</h1>

        <PermissionEditForm
          slug={slug}
          user={target}
          permissions={permissions}
          isSelf={target.userId === session.user.id}
          action={grantPermissionsAction}
        />
      </div>
    </main>
  );
}
