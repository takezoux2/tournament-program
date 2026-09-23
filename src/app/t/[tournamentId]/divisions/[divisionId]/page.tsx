import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DivisionMatchingView } from "@/components/division/DivisionMatchingView";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicPreviewNotice } from "@/components/public/PublicPreviewNotice";
import { needsParticipants } from "@/features/division/format";
import {
  type DivisionParticipant,
  findDivisionInTournament,
  listOverallOrderSources,
  listParticipantsInTournament,
  loadEntrySourceContext,
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

  // 描画に参加者名を使わない形式では参加者一覧を引かない。
  // 管理画面の部門詳細と同じ条件を needsParticipants で共有する。通し番号は
  // 公開ゲートと部門の絞り込みを通ったあとに読む。番号は部門ではなく
  // 大会全体の進行順から作るので、大会 id で引く。
  const [participants, overallSeq] = await Promise.all([
    needsParticipants(division.format)
      ? listParticipantsInTournament(tournament.organizationId, tournament.id)
      : Promise.resolve<DivisionParticipant[]>([]),
    listOverallOrderSources(tournament.id),
  ]);

  // 参照エントリー（他部門の結果で決まる枠）の表示名。参照は大会の中で
  // 閉じるので、この部門だけを描くページでも全部門を 1 度読む。
  const entrySources = await loadEntrySourceContext(
    tournament.organizationId,
    tournamentId,
    overallSeq,
    participants,
  );

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
        {tournament.isPreview && <PublicPreviewNotice />}
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>

        {/*
          ブラケットのときは枠に画面の大半を使う。dvh にするのは
          モバイルブラウザのアドレスバーの出入りで vh がずれるため。
          任意値クラスは Tailwind が走査できるよう文字列リテラルで渡す。
          リーグの結果表は内容の高さに従い、この値を使わない。
        */}
        <DivisionMatchingView
          division={division}
          participants={participants}
          overallSeq={overallSeq}
          heightClassName="h-[calc(100dvh-11rem)]"
          entryLabels={entrySources.views.get(division.id)?.labels}
        />
      </div>
    </main>
  );
}
