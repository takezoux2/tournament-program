import { AppHeader } from "@/components/layout/AppHeader";
import { ProfileOrganizationList } from "@/components/profile/ProfileOrganizationList";
import { listMembershipsForUser } from "@/features/organization/repository";
import { requireSession } from "@/shared/middleware/require-session";

export default async function ProfileOrgsPage() {
  const session = await requireSession();
  // 組織スコープの画面ではないので requireOrganization は使わない。
  // 絞り込みは userId を where に入れるクエリそのものが担う。
  const memberships = await listMembershipsForUser(session.user.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "プロフィール", href: "/profile" },
          { label: "所属組織" },
        ]}
        userName={session.user.name}
      userEmail={session.user.email}
      />

      <div className="mx-auto max-w-xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">所属組織</h1>
        <p className="text-xs text-slate-500">
          組織で行える操作は、その組織で付与された権限で決まります
        </p>

        <ProfileOrganizationList memberships={memberships} />
      </div>
    </main>
  );
}
