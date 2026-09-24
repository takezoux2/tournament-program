import { notFound } from "next/navigation";
import { TrackCreated } from "@/components/analytics/TrackCreated";
import { DivisionDetailView } from "@/components/division/DivisionDetail";
import { DivisionMatchingView } from "@/components/division/DivisionMatchingView";
import { AppHeader } from "@/components/layout/AppHeader";
import { needsParticipants } from "@/features/division/format";
import {
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
  loadEntrySourceContext,
} from "@/features/division/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionPage({
  params,
  searchParams,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]">) {
  const { slug, tournamentId, divisionId } = await params;
  const { created } = await searchParams;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division, overallSeq] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
    // 大会 id だけで読む関数だが、所有権は requireOrganization と上の 2 つが
    // 確かめ、見つからなければ下の notFound で打ち切る。番号が画面に出るのは
    // 所有権を通ったときだけ（setup / league のページと同じ形）。
    listOverallOrderSources(tournamentId),
  ]);
  if (!tournament || !division) {
    notFound();
  }

  // 描画に参加者名を使わない形式では、詳細ページ表示のたびに参加者一覧を
  // 引く必要はない。使う形式のときだけクエリを投げる。
  const participants = needsParticipants(division.format)
    ? await listParticipantsInTournament(organization.id, tournamentId)
    : [];

  // 参照エントリー（他部門の結果で決まる枠）の表示名。参照は大会の中で
  // 閉じるので、この部門だけを描くページでも全部門を 1 度読む。
  const entrySources = await loadEntrySourceContext(
    organization.id,
    tournamentId,
    overallSeq,
    participants,
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
          {
            label: tournament.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}`,
          },
          { label: division.name },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <DivisionDetailView
          slug={slug}
          tournamentId={tournament.id}
          division={division}
        />

        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">組み合わせ</h2>
          <DivisionMatchingView
            division={division}
            participants={participants}
            overallSeq={overallSeq}
            entryLabels={entrySources.views.get(division.id)?.labels}
            entryParticipantIds={
              entrySources.views.get(division.id)?.participantIds
            }
          />
        </div>
      </div>
    </main>
  );
}
