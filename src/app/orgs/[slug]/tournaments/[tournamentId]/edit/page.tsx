import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteTournamentForm } from "@/components/tournament/DeleteTournamentForm";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { UnpublishTournamentForm } from "@/components/tournament/UnpublishTournamentForm";
import { deleteTournamentAction } from "@/features/tournament/delete/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { unpublishTournamentAction } from "@/features/tournament/unpublish/handler";
import { updateTournamentAction } from "@/features/tournament/update/handler";
import { toDateTimeLocalValue } from "@/lib/datetime/local";
import { canByCode } from "@/shared/authz/ability";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditTournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/edit">) {
  const { slug, tournamentId } = await params;
  const { session, organization, ability } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  // UI の出し分けは体感のためで、境界は Server Action 側の requirePermission。
  const canUnpublish = canByCode(ability, "tournament.edit");

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
          { label: "編集" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">大会を編集</h1>
          <TournamentForm
            action={updateTournamentAction}
            slug={slug}
            submitLabel="保存する"
            defaultName={tournament.name}
            defaultStartsAt={toDateTimeLocalValue(tournament.startsAt)}
            defaultDescription={tournament.description}
            tournamentId={tournament.id}
          />
        </div>

        {tournament.status !== "DRAFT" && canUnpublish && (
          <UnpublishTournamentForm
            action={unpublishTournamentAction}
            slug={slug}
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        )}

        <DeleteTournamentForm
          action={deleteTournamentAction}
          tournamentName={tournament.name}
          slug={slug}
          tournamentId={tournament.id}
        />
      </div>
    </main>
  );
}
