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
 * <li> を返さないのは、一覧側（MatchOrderList）が行の枠を持つため。
 * 行の見た目を一覧に集めておくと、この部品は「試合名を直す口」だけに
 * 集中できる。
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

  // リーグの行は位置の文言を持たない（空文字）。入力欄の名前には対戦カードを
  // 使い、支援技術に「の試合名」という同じ名前の欄が並ばないようにする。
  const rowName = row.label === "" ? row.card : row.label;

  return (
    <div className="flex flex-1 items-center justify-between gap-4">
      <div className="min-w-0">
        {row.label !== "" && (
          <p className="text-sm font-medium text-slate-800">{row.label}</p>
        )}
        <p className="truncate text-xs text-slate-500">{row.card}</p>
      </div>

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="matchId" value={row.matchId} />
        {/* 入力欄はテンプレートそのもの。展開後は隣に出して、変数を書いた
            結果がその場で分かるようにする。 */}
        <input
          type="text"
          name="matchName"
          defaultValue={row.template}
          aria-label={`${rowName}の試合名`}
          className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="whitespace-nowrap text-xs text-slate-500">
          {row.matchName}
        </span>
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
