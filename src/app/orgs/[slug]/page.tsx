import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentList } from "@/components/tournament/TournamentList";
import { listTournamentsInOrganization } from "@/features/tournament/repository";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function OrganizationPage({
  params,
}: PageProps<"/orgs/[slug]">) {
  const { slug } = await params;
  const { session, organization, ability } = await requireOrganization(slug);
  const tournaments = await listTournamentsInOrganization(organization.id);
  const canViewUsers = canByCode(ability, "user.view");

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[{ label: "組織", href: "/" }, { label: organization.name }]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {organization.name}
            </h1>
            <p className="text-xs text-slate-500">{organization.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            {canViewUsers && (
              <Link
                href={`/orgs/${slug}/users`}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                ユーザー管理
              </Link>
            )}
            <Link
              href={`/orgs/${slug}/edit`}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              組織を編集
            </Link>
            <Link
              href={`/orgs/${slug}/tournaments/new`}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              大会を作成
            </Link>
          </div>
        </div>

        <h2 className="pt-4 text-sm font-bold text-slate-700">大会</h2>
        <TournamentList slug={slug} tournaments={tournaments} />
      </div>
    </main>
  );
}
