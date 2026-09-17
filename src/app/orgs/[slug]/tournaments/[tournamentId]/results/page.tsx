import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MatchResultList } from "@/components/result/MatchResultList";
import { recordResultAction } from "@/features/division/record-result/handler";
import { updateResultDetailAction } from "@/features/division/update-result-detail/handler";
import { loadResultRows } from "@/features/schedule/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentResultsPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/results">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const rows = await loadResultRows(organization.id, tournamentId);

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
          { label: "結果入力" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <div>
          <h1 className="text-lg font-bold text-slate-800">結果入力</h1>
          <p className="text-xs text-slate-500">
            勝った方を押すとその場で記録します。勝敗を記録すると、その部門のエントリー・組み合わせは編集できなくなります。勝因やスコアは「詳細」から入力します。
          </p>
        </div>

        <MatchResultList
          rows={rows}
          slug={slug}
          tournamentId={tournament.id}
          action={recordResultAction}
          detailAction={updateResultDetailAction}
        />
      </div>
    </main>
  );
}
