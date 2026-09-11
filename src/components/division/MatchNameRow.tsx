"use client";

import { useActionState } from "react";
import type { MatchNameRowView } from "@/features/division/match-name-view";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行の中身。1 行 1 フォームで、useActionState を行ごとに持たせ、
 * エラーをその行の隣に出す。試合名は組み合わせの構造を変えないため、
 * 勝敗記録後も編集できる（disabled を受け取らないのは意図）。
 *
 * <li> を返さないのは、一覧側（MatchOrderList）が行の枠とドラッグハンドルを
 * 持つため。行の見た目と掴む場所を一覧に集めておくと、この部品は
 * 「試合名を直す口」だけに集中できる。
 */
export function MatchNameRow({
  row,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  row: MatchNameRowView;
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
    <div className="flex flex-1 items-center justify-between gap-4">
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
          name="matchName"
          defaultValue={row.matchName}
          aria-label={`${row.label}の試合名`}
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
    </div>
  );
}
