import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { AddParticipantForm } from "@/components/participant/AddParticipantForm";
import { ParticipantList } from "@/components/participant/ParticipantList";
import { listMembersInOrganization } from "@/features/member/repository";
import { addParticipantAction } from "@/features/participant/add/handler";
import { removeParticipantAction } from "@/features/participant/remove/handler";
import { listParticipantsWithDivisions } from "@/features/participant/repository";
import { setPlayerNumberAction } from "@/features/participant/set-player-number/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentParticipantsPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/participants">) {
  const { slug, tournamentId } = await params;
  // 閲覧は大会詳細と同じく、組織のメンバーであれば可。
  const { session, organization, ability } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const [participants, members] = await Promise.all([
    listParticipantsWithDivisions(organization.id, tournamentId),
    listMembersInOrganization(organization.id),
  ]);

  // UI の出し分けは体感のためで、境界は各 Server Action の requirePermission。
  const canEdit = canByCode(ability, "tournament.edit");

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
          { label: "参加者一覧" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">参加者一覧</h1>
        <p className="text-xs text-slate-500">
          選手番号は大会内で共通のため、変更は部門の編集画面にも反映されます。
          部門にエントリー済みの参加者は、先に部門の編集画面から外してください
        </p>

        {canEdit && (
          <AddParticipantForm
            slug={slug}
            tournamentId={tournament.id}
            members={members}
            action={addParticipantAction}
          />
        )}

        <ParticipantList
          slug={slug}
          tournamentId={tournament.id}
          participants={participants}
          canEdit={canEdit}
          setPlayerNumberAction={setPlayerNumberAction}
          removeAction={removeParticipantAction}
        />
      </div>
    </main>
  );
}
