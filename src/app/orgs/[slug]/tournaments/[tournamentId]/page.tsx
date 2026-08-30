import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentDetailView } from "@/components/tournament/TournamentDetail";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function TournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]">) {
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
          { label: tournament.name },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-2xl px-6 py-8">
        <TournamentDetailView slug={slug} tournament={tournament} />
      </div>
    </main>
  );
}
