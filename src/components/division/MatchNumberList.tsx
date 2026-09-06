"use client";

import type { MatchNumberRowView } from "@/features/division/match-number-view";
import type { DivisionFormAction } from "@/features/division/state";
import { MatchNumberRow } from "./MatchNumberRow";

export function MatchNumberList({
  rows,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  rows: MatchNumberRowView[];
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ組み合わせがありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <MatchNumberRow
          key={row.matchId}
          row={row}
          slug={slug}
          tournamentId={tournamentId}
          divisionId={divisionId}
          action={action}
        />
      ))}
    </ul>
  );
}
