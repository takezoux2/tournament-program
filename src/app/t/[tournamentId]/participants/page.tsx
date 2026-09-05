import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicParticipantList } from "@/components/public/PublicParticipantList";
import { listParticipantsInTournament } from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/participants">): Promise<Metadata> {
  const { tournamentId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  if (tournament === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "参加者一覧",
    ),
  };
}

export default async function PublicParticipantsPage({
  params,
}: PageProps<"/t/[tournamentId]/participants">) {
  const { tournamentId } = await params;

  // 公開ゲート。DRAFT の除外はこの関数の where が持つ。
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡すことで、既存リポジトリの
  // 所有権チェックをそのまま使える。
  const participants = await listParticipantsInTournament(
    tournament.organizationId,
    tournament.id,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: "参加者一覧" },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-lg font-bold text-slate-800">参加者一覧</h1>

        <PublicParticipantList participants={participants} />
      </div>
    </main>
  );
}
