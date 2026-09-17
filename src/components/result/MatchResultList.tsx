"use client";

import type { DivisionFormAction } from "@/features/division/state";
import type { ResultRowView } from "@/features/schedule/result-rows";
import { MatchResultRow } from "./MatchResultRow";

/**
 * 進行順に並んだ結果入力の一覧。並べ替えと区切りの編集は試合一覧
 * （/matches）が持つので、ここでは区切りを見出しとして出すだけにする。
 */
export function MatchResultList({
  rows,
  slug,
  tournamentId,
  action,
  detailAction,
}: {
  rows: ResultRowView[];
  slug: string;
  tournamentId: string;
  action: DivisionFormAction;
  detailAction: DivisionFormAction;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">まだ試合がありません</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) =>
        row.kind === "divider" ? (
          <li
            key={row.key}
            className="rounded bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
          >
            {row.label}
          </li>
        ) : (
          <MatchResultRow
            key={row.key}
            row={row}
            slug={slug}
            tournamentId={tournamentId}
            action={action}
            detailAction={detailAction}
          />
        ),
      )}
    </ul>
  );
}
