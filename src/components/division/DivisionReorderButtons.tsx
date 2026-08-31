"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 隣接する部門と並び順を入れ替えるボタン。2 つの submit ボタンが同じ name を
 * 持ち、押された方の value が direction として送られる。
 */
export function DivisionReorderButtons({
  action,
  slug,
  tournamentId,
  divisionId,
  canMoveUp,
  canMoveDown,
}: {
  action: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />

      <button
        type="submit"
        name="direction"
        value="up"
        aria-label="上へ移動"
        // 活性の判定は体感のためで、境界ではない。端の要求は handler が受け流す。
        disabled={pending || !canMoveUp}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="submit"
        name="direction"
        value="down"
        aria-label="下へ移動"
        disabled={pending || !canMoveDown}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
      >
        ↓
      </button>

      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
