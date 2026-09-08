import { notFound } from "next/navigation";
import { DivisionForm } from "@/components/division/DivisionForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { createDivisionAction } from "@/features/division/create/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function NewDivisionPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/new">) {
  const { slug, tournamentId } = await params;
  const { session, organization } = await requireOrganization(slug);

  // パンくずに大会名を出すため取得する。同時に、この組織の大会であることも確かめる。
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
          { label: "部門を作成" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">部門を作成</h1>
        <DivisionForm
          action={createDivisionAction}
          slug={slug}
          tournamentId={tournament.id}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
