import { notFound } from "next/navigation";
import { DivisionSetup } from "@/components/division/DivisionSetup";
import { AppHeader } from "@/components/layout/AppHeader";
import { addEntryAction } from "@/features/division/add-entry/handler";
import { generateMatchingAction } from "@/features/division/generate-matching/handler";
import { isSlotBracketFormat } from "@/features/division/matching-strategy";
import { removeEntryAction } from "@/features/division/remove-entry/handler";
import { reorderEntryAction } from "@/features/division/reorder-entry/handler";
import {
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { setMatchNameAction } from "@/features/division/set-match-name/handler";
import { setPlayerNumberAction } from "@/features/division/set-player-number/handler";
import { swapSlotsAction } from "@/features/division/swap-slots/handler";
import { listMembersInOrganization } from "@/features/organization/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionSetupPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  // 詳細ページと違い、参加者とメンバーを常に引く。この画面は
  // トーナメント形式（SE・DE）を編集するために開くもので、どちらも必ず使うため。
  const [tournament, division, participants, members, overallSeq] =
    await Promise.all([
      findTournamentInOrganization(organization.id, tournamentId),
      findDivisionInTournament(organization.id, tournamentId, divisionId),
      listParticipantsInTournament(organization.id, tournamentId),
      listMembersInOrganization(organization.id),
      listOverallOrderSources(tournamentId),
    ]);
  if (!tournament || !division) {
    notFound();
  }
  // リーグには専用画面（/league）がある。案内を出すより 404 に倒す。
  if (!isSlotBracketFormat(division.format)) {
    notFound();
  }

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
          {
            label: division.name,
            href: `/orgs/${slug}/tournaments/${tournament.id}/divisions/${division.id}`,
          },
          { label: "エントリー・組み合わせ" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">
          {division.name} のエントリー・組み合わせ
        </h1>

        <DivisionSetup
          division={division}
          participants={participants}
          members={members}
          slug={slug}
          tournamentId={tournament.id}
          overallSeq={overallSeq}
          actions={{
            addEntry: addEntryAction,
            removeEntry: removeEntryAction,
            reorderEntry: reorderEntryAction,
            generateMatching: generateMatchingAction,
            swapSlots: swapSlotsAction,
            setMatchName: setMatchNameAction,
            setPlayerNumber: setPlayerNumberAction,
          }}
        />
      </div>
    </main>
  );
}
