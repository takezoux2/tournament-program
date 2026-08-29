import { AppHeader } from "@/components/layout/AppHeader";
import { TournamentForm } from "@/components/tournament/TournamentForm";
import { createTournamentAction } from "@/features/tournament/create/handler";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function NewTournamentPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/new">) {
  const { slug } = await params;
  const { session, organization } = await requireOrganization(slug);

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader
        crumbs={[
          { label: "組織", href: "/" },
          { label: organization.name, href: `/orgs/${slug}` },
          { label: "大会を作成" },
        ]}
        userName={session.user.name}
      />

      <div className="mx-auto max-w-sm space-y-6 px-6 py-8">
        <h1 className="text-lg font-bold text-slate-800">大会を作成</h1>
        <TournamentForm
          action={createTournamentAction}
          slug={slug}
          submitLabel="作成する"
        />
      </div>
    </main>
  );
}
