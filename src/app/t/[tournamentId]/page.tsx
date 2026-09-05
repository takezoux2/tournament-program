import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicDivisionList } from "@/components/public/PublicDivisionList";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicTournamentSummary } from "@/components/public/PublicTournamentSummary";
import { listDivisionsInTournament } from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]">): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(tournament.name, tournament.organizationName),
  };
}

export default async function PublicTournamentPage({
  params,
}: PageProps<"/t/[tournamentId]">) {
  const { tournamentId } = await params;

  // 公開ゲート。公開してよい状態だけを where で許可するのはこの関数が持つ。
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡す。この値はゲートで取得済みの行に
  // 由来するため、以降の where はトートロジーにしかならず、公開可否は
  // ゲート単独で決まっている。それでも渡しておくのは無害な多層防御になる。
  const divisions = await listDivisionsInTournament(
    tournament.organizationId,
    tournament.id,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <PublicTournamentSummary tournament={tournament} />

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/t/${tournament.id}/schedule`}
            className="rounded border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800"
          >
            試合一覧
          </Link>
          <Link
            href={`/t/${tournament.id}/participants`}
            className="rounded border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-800"
          >
            参加者一覧
          </Link>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">部門</h2>
          <PublicDivisionList
            tournamentId={tournament.id}
            divisions={divisions}
          />
        </section>
      </div>
    </main>
  );
}
