import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDivisionSection } from "@/components/print/PrintDivisionSection";
import { PrintParticipantTable } from "@/components/print/PrintParticipantTable";
import { PrintSummarySection } from "@/components/print/PrintSummarySection";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { PublicPreviewNotice } from "@/components/public/PublicPreviewNotice";
import {
  listDivisionDetailsInTournament,
  listOverallOrderSources,
  loadEntrySourceContext,
} from "@/features/division/repository";
import { listParticipantsWithDivisions } from "@/features/participant/repository";
import { parsePrintOptions, printPageCss } from "@/features/print/options";
import { formatPublicTitle } from "@/features/tournament/format";
import { findPublicTournament } from "@/features/tournament/repository";
import { getOptionalSession } from "@/shared/middleware/require-session";

export async function generateMetadata({
  params,
}: PageProps<"/t/[tournamentId]/print">): Promise<Metadata> {
  const { tournamentId } = await params;
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  // 公開対象でない大会の名前をタイトルに出さない。本体は notFound になる。
  if (tournament === null) {
    return {};
  }
  return {
    // 印刷ダイアログの「PDF に保存」は既定のファイル名にタイトルを使う
    title: formatPublicTitle(
      tournament.name,
      tournament.organizationName,
      "印刷用",
    ),
  };
}

/**
 * 画面では用紙を模した白い箱を並べ、印刷では箱の飾りを消して用紙の余白
 * (@page の margin)に任せる。
 */
const sheetClassName =
  "rounded bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none";

export default async function PublicPrintPage({
  params,
  searchParams,
}: PageProps<"/t/[tournamentId]/print">) {
  const { tournamentId } = await params;
  const options = parsePrintOptions(await searchParams);

  // 公開ゲート。公開してよい状態だけを where で許可するのはこの関数が持つ。
  // 閲覧者を渡すのは、その組織のメンバーに準備中の大会も印刷させるため。
  const session = await getOptionalSession();
  const tournament = await findPublicTournament(
    tournamentId,
    session?.user.id ?? null,
  );
  if (tournament === null) {
    notFound();
  }

  // ゲートが返した organizationId を渡す(他の公開ページと同じ多層防御)。
  // 選手一覧の参加者は DivisionParticipant の形も満たすので、ブラケットの
  // 名前解決にもそのまま使い、参加者を 2 度引かない。
  const [divisions, participants, overallSeq] = await Promise.all([
    listDivisionDetailsInTournament(tournament.organizationId, tournament.id),
    listParticipantsWithDivisions(tournament.organizationId, tournament.id),
    listOverallOrderSources(tournament.id),
  ]);

  // 印刷は既に全部門を読んでいるが、解決には parse 済みの形が要るため
  // 同じ関数を通す（クエリ 1 本ぶんの重複は許す。文言を 1 箇所に保つ方を採る）。
  const entrySources = await loadEntrySourceContext(
    tournament.organizationId,
    tournament.id,
    overallSeq,
    participants,
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 print:bg-white">
      {/* 用紙サイズは実行時に決まるので、@page はここで埋め込む */}
      <style>{printPageCss(options.paper)}</style>
      <PrintToolbar tournamentId={tournament.id} options={options} />

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 print:max-w-none print:space-y-0 print:p-0">
        {tournament.isPreview && (
          <div className="print:hidden">
            <PublicPreviewNotice />
          </div>
        )}

        <div className={sheetClassName}>
          <PrintSummarySection tournament={tournament} divisions={divisions} />
        </div>

        <div className={`${sheetClassName} break-before-page`}>
          <PrintParticipantTable participants={participants} />
        </div>

        {divisions.map((division) => (
          // 名前付きページ division は @page division(横向き)になる
          <div
            key={division.id}
            className={`${sheetClassName} break-before-page [page:division]`}
          >
            <PrintDivisionSection
              division={division}
              participants={participants}
              overallSeq={overallSeq}
              withResults={options.results}
              entryLabels={entrySources.views.get(division.id)?.labels}
              entryParticipantIds={
                entrySources.views.get(division.id)?.participantIds
              }
            />
          </div>
        ))}
      </div>
    </main>
  );
}
