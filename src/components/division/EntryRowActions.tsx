"use client";

import { useActionState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

/**
 * 1 行ぶんの並べ替えと削除。並べ替えは 2 つの submit ボタンが同じ name を持ち、
 * 押された方の value が direction として送られる（DivisionReorderButtons と同じ形）。
 * 削除は別のフォームに分ける。同じフォームに入れると direction が一緒に飛ぶため。
 */
export function EntryRowActions({
  reorderAction,
  removeAction,
  slug,
  tournamentId,
  divisionId,
  entryId,
  canMoveUp,
  canMoveDown,
  disabled,
}: {
  reorderAction: DivisionFormAction;
  removeAction: DivisionFormAction;
  slug: string;
  tournamentId: string;
  divisionId: string;
  entryId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
}) {
  const [reorderState, reorderFormAction, reorderPending] = useActionState(
    reorderAction,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removeAction,
    INITIAL_DIVISION_FORM_STATE,
  );

  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />
      <input type="hidden" name="entryId" value={entryId} />
    </>
  );

  return (
    <div className="flex items-center gap-2">
      <form action={reorderFormAction} className="flex items-center gap-1">
        {hidden}
        <button
          type="submit"
          name="direction"
          value="up"
          aria-label="上へ移動"
          // 活性の判定は体感のためで、境界ではない。端の要求は handler が受け流す。
          disabled={reorderPending || disabled || !canMoveUp}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          aria-label="下へ移動"
          disabled={reorderPending || disabled || !canMoveDown}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          ↓
        </button>
      </form>

      <form action={removeFormAction}>
        {hidden}
        <button
          type="submit"
          aria-label="削除"
          disabled={removePending || disabled}
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-30"
        >
          削除
        </button>
      </form>

      {reorderState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {reorderState.error}
        </p>
      )}
      {removeState.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {removeState.error}
        </p>
      )}
      {removeState.notice !== undefined && (
        // biome の useSemanticElements 指摘に従い、role="status" ではなく
        // 暗黙のロールが status な <output> を使う（MatchingSection と同じ）。
        <output className="text-xs text-slate-600">{removeState.notice}</output>
      )}
    </div>
  );
}
