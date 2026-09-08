import { AppHeader } from "@/components/layout/AppHeader";
import { AddUserForm } from "@/components/organization-user/AddUserForm";
import { OrganizationUserList } from "@/components/organization-user/OrganizationUserList";
import { addUserAction } from "@/features/organization-user/add/handler";
import { removeUserAction } from "@/features/organization-user/remove/handler";
import { listUsersInOrganization } from "@/features/organization-user/repository";
import { searchUserAction } from "@/features/organization-user/search/handler";
import { canByCode } from "@/shared/authz/ability";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function OrganizationUsersPage({
  params,
}: PageProps<"/orgs/[slug]/users">) {
  const { slug } = await params;
  const { session, organization, ability } = await requirePermission(
    slug,
    "user.view",
  );
  const users = await listUsersInOrganization(organization.id);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canAdd = canByCode(ability, "user.add");
  const canRemove = canByCode(ability, "user.remove");
  const canGrant = canByCode(ability, "user.grant");

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "ユーザー" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">ユーザー</h1>

        {canAdd && (
          <AddUserForm
            slug={slug}
            searchAction={searchUserAction}
            addAction={addUserAction}
          />
        )}

        <OrganizationUserList
          slug={slug}
          users={users}
          currentUserId={session.user.id}
          canRemove={canRemove}
          canGrant={canGrant}
          removeAction={removeUserAction}
        />
      </div>
    </main>
  );
}
