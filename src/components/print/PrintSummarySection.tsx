import { TournamentDescriptionMarkdown } from "@/components/tournament/TournamentDescriptionMarkdown";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionSummary } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";
import type { PublicTournament } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

/**
 * 印刷の 1 ページ目。紙だけで大会の要点が分かるよう、公開ページの概要に
 * 部門の一覧を添える。
 */
export function PrintSummarySection({
  tournament,
  divisions,
}: {
  tournament: PublicTournament;
  divisions: DivisionSummary[];
}) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-slate-600">{tournament.organizationName}</p>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
      </div>

      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        <dt className="text-slate-600">開始日時</dt>
        <dd>{formatStartsAt(tournament.startsAt)}</dd>
        <dt className="text-slate-600">ステータス</dt>
        <dd>{TOURNAMENT_STATUS_LABELS[tournament.status]}</dd>
      </dl>

      {tournament.description !== "" && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">概要</h2>
          <TournamentDescriptionMarkdown markdown={tournament.description} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold">部門</h2>
        {divisions.length === 0 ? (
          <p className="text-sm">部門がありません</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {divisions.map((division) => (
              <li key={division.id}>
                {`${division.name}（${DIVISION_FORMAT_LABELS[division.format]}）`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
