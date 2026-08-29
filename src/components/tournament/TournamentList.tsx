import Link from "next/link";
import { formatStartsAt } from "@/features/tournament/format";
import type { TournamentSummary } from "@/features/tournament/repository";
import { TOURNAMENT_STATUS_LABELS } from "@/features/tournament/status";

export function TournamentList({
  slug,
  tournaments,
}: {
  slug: string;
  tournaments: TournamentSummary[];
}) {
  if (tournaments.length === 0) {
    return <p className="text-sm text-slate-600">まだ大会がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {tournaments.map((tournament) => (
        <li
          key={tournament.id}
          className="rounded border border-slate-200 bg-white px-4 py-3"
        >
          <Link
            href={`/orgs/${slug}/tournaments/${tournament.id}`}
            className="font-medium text-slate-800 underline"
          >
            {tournament.name}
          </Link>
          <p className="text-xs text-slate-500">
            <span>{TOURNAMENT_STATUS_LABELS[tournament.status]}</span>
            {" / 開始 "}
            <span>{formatStartsAt(tournament.startsAt)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
