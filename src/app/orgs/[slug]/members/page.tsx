import { AppHeader } from "@/components/layout/AppHeader";
import { AddMemberForm } from "@/components/member/AddMemberForm";
import { MemberList } from "@/components/member/MemberList";
import { addMemberAction } from "@/features/member/add/handler";
import { removeMemberAction } from "@/features/member/remove/handler";
import { listMembersInOrganization } from "@/features/member/repository";
import { canByCode } from "@/shared/authz/ability";
import { requirePermission } from "@/shared/middleware/require-organization";

export default async function OrganizationMembersPage({
  params,
}: PageProps<"/orgs/[slug]/members">) {
  const { slug } = await params;
  const { session, organization, ability } = await requirePermission(
    slug,
    "member.view",
  );
  const members = await listMembersInOrganization(organization.id);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canAdd = canByCode(ability, "member.add");
  const canRemove = canByCode(ability, "member.remove");

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "メンバー" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">メンバー</h1>

        {canAdd && <AddMemberForm slug={slug} addAction={addMemberAction} />}

        <MemberList
          slug={slug}
          members={members}
          canRemove={canRemove}
          removeAction={removeMemberAction}
        />
      </div>
    </main>
  );
}
