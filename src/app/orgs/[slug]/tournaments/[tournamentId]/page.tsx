import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackCreated } from "@/components/analytics/TrackCreated";
import { DivisionList } from "@/components/division/DivisionList";
import { AppHeader } from "@/components/layout/AppHeader";
import { PublishTournamentButton } from "@/components/tournament/PublishTournamentButton";
import { TournamentDetailView } from "@/components/tournament/TournamentDetail";
import { reorderDivisionAction } from "@/features/division/reorder/handler";
import { listDivisionsInTournament } from "@/features/division/repository";
import { publishTournamentAction } from "@/features/tournament/publish/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentPage({
  params,
  searchParams,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]">) {
  const { slug, tournamentId } = await params;
  const { created } = await searchParams;
  const { session, organization, ability } = await requireOrganization(slug);

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

  // UI の出し分けは体感のためで、境界は Server Action 側の requirePermission。
  const canPublish = canByCode(ability, "tournament.edit");

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
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <TournamentDetailView slug={slug} tournament={tournament} />

        <div className="flex flex-wrap gap-2">
          {/* 公開後は status が DRAFT でなくなり、revalidate でボタンが消える。 */}
          {tournament.status === "DRAFT" && canPublish && (
            <PublishTournamentButton
              action={publishTournamentAction}
              slug={slug}
              tournamentId={tournament.id}
              tournamentName={tournament.name}
            />
          )}

          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}/participants`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            参加者一覧
          </Link>

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

          {/* 印刷は公開ページの印刷用画面を使う。準備中でもメンバーは公開ゲートを通れる */}
          <Link
            href={`/t/${tournament.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
          >
            印刷用PDF
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
