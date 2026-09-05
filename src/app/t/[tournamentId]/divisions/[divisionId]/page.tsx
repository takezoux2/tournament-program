import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DivisionBracket } from "@/components/division/DivisionBracket";
import { PublicHeader } from "@/components/public/PublicHeader";
import {
  findDivisionInTournament,
  listParticipantsInTournament,
} from "@/features/division/repository";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/divisions/[divisionId]">): Promise<Metadata> {
  const { tournamentId, divisionId } = await params;
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    return {};
  }
  const division = await findDivisionInTournament(
    tournament.organizationId,
    tournament.id,
    divisionId,
  );
  if (division === null) {
    return {};
  }
  return {
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      division.name,
    ),
  };
}

export default async function PublicDivisionPage({
  params,
}: PageProps<"/t/[tournamentId]/divisions/[divisionId]">) {
  const { tournamentId, divisionId } = await params;

  // 公開ゲート。DRAFT の除外はこの関数の where が持つ。
  const tournament = await findPublicTournament(tournamentId);
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡す。この値はゲートで取得済みの行に
  // 由来するため、以降の where はトートロジーにしかならず、公開可否は
  // ゲート単独で決まっている。それでも渡しておくのは無害な多層防御になる。
  const division = await findDivisionInTournament(
    tournament.organizationId,
    tournament.id,
    divisionId,
  );
  if (division === null) {
    notFound();
  }

  // DivisionBracket は SINGLE_ELIMINATION 以外では participants を一切使わず
  // 未対応の案内を出すだけ。管理画面と同じく、使う形式のときだけ引く。
  const participants =
    division.format === "SINGLE_ELIMINATION"
      ? await listParticipantsInTournament(
          tournament.organizationId,
          tournament.id,
        )
      : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicHeader
        crumbs={[
          { label: tournament.organizationName },
          { label: tournament.name, href: `/t/${tournament.id}` },
          { label: division.name },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>

        {/*
          ブラケット専用の画面なので、枠に画面の大半を使う。dvh にするのは
          モバイルブラウザのアドレスバーの出入りで vh がずれるため。
          任意値クラスは Tailwind が走査できるよう文字列リテラルで渡す。
        */}
        <DivisionBracket
          division={division}
          participants={participants}
          heightClassName="h-[calc(100dvh-11rem)]"
        />
      </div>
    </main>
  );
}
