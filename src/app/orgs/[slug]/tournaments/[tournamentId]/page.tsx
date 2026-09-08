import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackCreated } from "@/components/analytics/TrackCreated";
import { DivisionList } from "@/components/division/DivisionList";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentDetailView } from "@/components/tournament/TournamentDetail";
import { reorderDivisionAction } from "@/features/division/reorder/handler";
import { listDivisionsInTournament } from "@/features/division/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentPage({
  params,
  searchParams,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]">) {
  const { slug, tournamentId } = await params;
  const { created } = await searchParams;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const divisions = await listDivisionsInTournament(
    organization.id,
    tournamentId,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <TrackCreated
        created={typeof created === "string" ? created : undefined}
      />
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: tournament.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <TournamentDetailView slug={slug} tournament={tournament} />

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/matches`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            試合一覧
          </Link>

          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/results`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            結果入力
          </Link>

          <Link
            href={`/t/${tournament.id}`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            公開ページを開く
          </Link>
        </div>

        <div className="flex items-center justify-between pt-4">
          <h2 className="text-sm font-bold text-slate-700">部門</h2>
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/divisions/new`}
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            部門を作成
          </Link>
        </div>

        <DivisionList
          slug={slug}
          tournamentId={tournament.id}
          divisions={divisions}
          reorderAction={reorderDivisionAction}
        />
      </div>
    </main>
  );
}
