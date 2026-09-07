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
import { getOptionalSession } from "@/shared/middleware/require-session";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/divisions/[divisionId]">): Promise<Metadata> {
  const { tournamentId, divisionId } = await params;
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
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

  // ゲートが返した organizationId を渡す。findDivisionInTournament の where は
  // tournament: { id: tournamentId, organizationId } なので、organizationId の
  // 一致はゲートで取得済みの行に由来しトートロジーにしかならない。一方
  // tournament: { id } は divisionId が URL 由来であるため実効的なチェックで、
  // 他の大会に属する部門がこの URL 配下に出てしまうのを防いでいる。
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
