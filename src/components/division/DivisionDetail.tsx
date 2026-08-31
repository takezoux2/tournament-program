import Link from "next/link";
import { DIVISION_FORMAT_LABELS } from "@/features/division/format";
import type { DivisionDetail } from "@/features/division/repository";
import { formatStartsAt } from "@/features/tournament/format";

export function DivisionDetailView({
  slug,
  tournamentId,
  division,
}: {
  slug: string;
  tournamentId: string;
  division: DivisionDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="text-lg font-bold text-slate-800">{division.name}</h1>
        <Link
          href={`/orgs/${slug}/tournaments/${tournamentId}/divisions/${division.id}/edit`}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          部門を編集
        </Link>
      </div>

      <dl className="space-y-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">試合形式</dt>
          <dd className="text-slate-800">
            {DIVISION_FORMAT_LABELS[division.format]}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 text-slate-500">作成日時</dt>
          <dd className="text-slate-800">
            {formatStartsAt(division.createdAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
