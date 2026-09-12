import { notFound } from "next/navigation";
import { TrackCreated } from "@/components/analytics/TrackCreated";
import { DivisionDetailView } from "@/components/division/DivisionDetail";
import { DivisionMatchingView } from "@/components/division/DivisionMatchingView";
import { AppHeader } from "@/components/layout/AppHeader";
import { needsParticipants } from "@/features/division/format";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
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

  const [tournament, division] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
  ]);
  if (!tournament || !division) {
    notFound();
  }

  // 描画に参加者名を使わない形式では、詳細ページ表示のたびに参加者一覧を
  // 引く必要はない。使う形式のときだけクエリを投げる。
  const participants = needsParticipants(division.format)
    ? await listParticipantsInTournament(organization.id, tournamentId)
    : [];

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
          />
        </div>
      </div>
    </main>
  );
}
