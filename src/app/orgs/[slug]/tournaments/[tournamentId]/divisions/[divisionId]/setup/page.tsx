import { notFound } from "next/navigation";
import { BracketEditorSetup } from "@/components/division/BracketEditorSetup";
import { AppHeader } from "@/components/layout/AppHeader";
import { addFirstRoundMatchAction } from "@/features/division/add-first-round-match/handler";
import { assignSlotAction } from "@/features/division/assign-slot/handler";
import { clearSlotAction } from "@/features/division/clear-slot/handler";
import { generateMatchingAction } from "@/features/division/generate-matching/handler";
import { removeFirstRoundMatchAction } from "@/features/division/remove-first-round-match/handler";
import {
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { setMatchNameAction } from "@/features/division/set-match-name/handler";
import { listMembersInOrganization } from "@/features/organization/repository";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function DivisionSetupPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/setup">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  // 詳細ページと違い、参加者とメンバーを常に引く。この画面は
  // シングルエリミネーションを編集するために開くもので、どちらも必ず使うため。
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
  if (division.format !== "SINGLE_ELIMINATION") {
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

        <BracketEditorSetup
          division={division}
          participants={participants}
          members={members}
          slug={slug}
          tournamentId={tournament.id}
          overallSeq={overallSeq}
          actions={{
            addFirstRoundMatch: addFirstRoundMatchAction,
            removeFirstRoundMatch: removeFirstRoundMatchAction,
            assignSlot: assignSlotAction,
            clearSlot: clearSlotAction,
            generateMatching: generateMatchingAction,
            setMatchName: setMatchNameAction,
          }}
        />
      </div>
    </main>
  );
}
