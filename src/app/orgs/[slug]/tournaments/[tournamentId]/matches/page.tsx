import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScheduleList } from "@/components/schedule/ScheduleList";
import { insertDividerAction } from "@/features/schedule/insert-divider/handler";
import { removeDividerAction } from "@/features/schedule/remove-divider/handler";
import { reorderScheduleAction } from "@/features/schedule/reorder/handler";
import { loadScheduleView } from "@/features/schedule/repository";
import { updateDividerAction } from "@/features/schedule/update-divider/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentMatchesPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/matches">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const rows = await loadScheduleView(organization.id, tournamentId);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          {
            label: tournament.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}`,
          },
          { label: "試合一覧" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div>
          <h1 className="text-lg font-bold text-slate-800">試合一覧</h1>
          <p className="text-xs text-slate-500">
            全部門の試合を進行順に並べます。この並びは組み合わせ（ブラケット）には影響しません。
          </p>
        </div>

        <ScheduleList
          slug={slug}
          tournamentId={tournament.id}
          rows={rows}
          reorderAction={reorderScheduleAction}
          insertDividerAction={insertDividerAction}
          updateDividerAction={updateDividerAction}
          removeDividerAction={removeDividerAction}
        />
      </div>
    </main>
  );
}
