import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicScheduleList } from "@/components/public/PublicScheduleList";
import { loadScheduleView } from "@/features/schedule/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";
import { getOptionalSession } from "@/shared/middleware/require-session";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/schedule">): Promise<Metadata> {
  const { tournamentId } = await params;
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "試合一覧",
    ),
  };
}

export default async function PublicSchedulePage({
  params,
}: PageProps<"/t/[tournamentId]/schedule">) {
  const { tournamentId } = await params;

  // 公開ゲート。公開してよい状態だけを where で許可するのはこの関数が持つ。
  // 閲覧者を渡すのは、その組織のメンバーに準備中の大会も見せるため。
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡す。この値はゲートで取得済みの行に
  // 由来するため、以降の where はトートロジーにしかならず、公開可否は
  // ゲート単独で決まっている。それでも渡しておくのは無害な多層防御になる。
  const rows = await loadScheduleView(tournament.organizationId, tournament.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: "試合一覧" },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-lg font-bold text-slate-800">試合一覧</h1>
          <p className="text-xs text-slate-500">
            全部門の試合を進行順に並べています。
          </p>
        </div>

        <PublicScheduleList rows={rows} />
      </div>
    </main>
  );
}
