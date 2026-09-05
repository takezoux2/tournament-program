import { TournamentDescriptionMarkdown } from "@/components/tournament/TournamentDescriptionMarkdown";
import { formatStartsAt } from "@/features/tournament/format";
import type { PublicTournament } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

/**
 * 公開ページの大会概要。管理画面の TournamentDetailView と違い編集リンクを持たず、
 * 作成日時も出さない（閲覧者には意味がないため）。
 *
 * 定義リストは狭い画面で横並びにすると値が潰れるので、sm 未満では縦に積む。
 */
export function PublicTournamentSummary({
  tournament,
}: {
  tournament: PublicTournament;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{tournament.organizationName}</p>
        <h1 className="text-xl font-bold text-slate-800">{tournament.name}</h1>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-slate-500 sm:w-24">ステータス</dt>
          <dd className="text-slate-800">
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-slate-500 sm:w-24">開始日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.startsAt)}
          </dd>
        </div>
      </dl>

      {tournament.description !== "" && (
        <section className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3">
          <h2 className="text-sm font-medium text-slate-500">概要</h2>
          <TournamentDescriptionMarkdown markdown={tournament.description} />
        </section>
      )}
    </div>
  );
}
