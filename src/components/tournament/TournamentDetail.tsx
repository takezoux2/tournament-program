import Link from "next/link";
import { formatStartsAt } from "@/features/tournament/format";
import type { TournamentDetail } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";
import { TournamentDescriptionMarkdown } from "./TournamentDescriptionMarkdown";

export function TournamentDetailView({
  slug,
  tournament,
}: {
  slug: string;
  tournament: TournamentDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{tournament.name}</h1>
        <Link
          href={`/orgs/${slug}/tournaments/${tournament.id}/edit`}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          大会を編集
        </Link>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">ステータス</dt>
          <dd className="text-slate-800">
            {TOURNAMENT_STATUS_LABELS[tournament.status]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">開始日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.startsAt)}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(tournament.createdAt)}
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
