import { notFound } from "next/navigation";
import { DeleteDivisionForm } from "@/components/division/DeleteDivisionForm";
import { DivisionForm } from "@/components/division/DivisionForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { deleteDivisionAction } from "@/features/division/delete/handler";
import { findDivisionInTournament } from "@/features/division/repository";
import { updateDivisionAction } from "@/features/division/update/handler";
import { findTournamentInOrganization } from "@/features/tournament/repository";
import { parseDivisionResultConfig } from "@/lib/division/parse";
import { DEFAULT_DIVISION_RESULT_CONFIG } from "@/lib/division/types";
import { requireOrganization } from "@/shared/middleware/require-organization";

export default async function EditDivisionPage({
  params,
}: PageProps<"/orgs/[slug]/tournaments/[tournamentId]/divisions/[divisionId]/edit">) {
  const { slug, tournamentId, divisionId } = await params;
  const { session, organization } = await requireOrganization(slug);

  const [tournament, division] = await Promise.all([
    findTournamentInOrganization(organization.id, tournamentId),
    findDivisionInTournament(organization.id, tournamentId, divisionId),
  ]);
  if (!tournament || !division) {
    notFound();
  }

  // Json は DB の列で、アプリの外から壊れた値が入りうる。編集画面まで落とさず、
  // 読めないときは既定値を出して直せるようにする。
  let resultConfig = DEFAULT_DIVISION_RESULT_CONFIG;
  try {
    resultConfig = parseDivisionResultConfig(division.resultConfig);
  } catch {
    resultConfig = DEFAULT_DIVISION_RESULT_CONFIG;
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
          { label: "編集" },
        ]}
        userName={session.user.name}
        userEmail={session.user.email}
      />

      <div className="mx-auto max-w-sm space-y-8 px-6 py-8">
        <div className="space-y-4">
          <h1 className="text-lg font-bold text-slate-800">部門を編集</h1>
          <DivisionForm
            action={updateDivisionAction}
            slug={slug}
            tournamentId={tournament.id}
            submitLabel="保存する"
            defaultName={division.name}
            defaultFormat={division.format}
            divisionId={division.id}
            defaultResultConfig={resultConfig}
          />
        </div>

        <DeleteDivisionForm
          action={deleteDivisionAction}
          divisionName={division.name}
          slug={slug}
          tournamentId={tournament.id}
          divisionId={division.id}
        />
      </div>
    </main>
  );
}
