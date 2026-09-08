import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeleteTournamentForm } from "@/components/tournament/DeleteTournamentForm";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { deleteTournamentAction } from "@/features/tournament/delete/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { updateTournamentAction } from "@/features/tournament/update/handler";
import { toDateTimeLocalValue } from "@/lib/datetime/local";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditTournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/edit">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
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
