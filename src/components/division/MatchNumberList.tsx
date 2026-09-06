"use client";

import { useActionState } from "react";
import type { MatchNumberRowView } from "@/features/division/match-number-view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行 1 フォーム。useActionState を行ごとに持たせ、エラーをその行の隣に出す。
 * 試合番号は組み合わせの構造を変えないため、勝敗記録後も編集できる
 * （disabled を受け取らないのは意図）。
 */
function MatchNumberRow({
  row,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  row: MatchNumberRowView;
  slug: string;
  tournamentId: string;
  divisionId: string;
  action: DivisionFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <li className="flex items-center justify-between gap-4 rounded border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{row.label}</p>
        <p className="truncate text-xs text-slate-500">{row.card}</p>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="matchId" value={row.matchId} />
        <input
          type="text"
          name="matchNumber"
          defaultValue={row.matchNumber}
          aria-label={`${row.label}の試合番号`}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          保存
        </button>
        {state.error !== null && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        )}
      </form>
    </li>
  );
}

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
