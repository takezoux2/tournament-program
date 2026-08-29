"use client";

import { useActionState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function TournamentForm({
  action,
  slug,
  submitLabel,
  defaultName = "",
  defaultStartsAt = "",
  tournamentId,
}: {
  action: TournamentFormAction;
  slug: string;
  submitLabel: string;
  defaultName?: string;
  /** toDateTimeLocalValue で作った YYYY-MM-DDTHH:mm 形式の文字列。 */
  defaultStartsAt?: string;
  /** 編集時に渡す。どの大会を更新するかを handler へ伝える。 */
  tournamentId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {tournamentId !== undefined && (
        <input type="hidden" name="tournamentId" value={tournamentId} />
      )}

      <div className="space-y-1">
        <label
          htmlFor="name"
          className="block text-sm font-medium text-slate-700"
        >
          大会名
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="startsAt"
          className="block text-sm font-medium text-slate-700"
        >
          開始日時
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          defaultValue={defaultStartsAt}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">未定なら空のままでよい</p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "送信中..." : submitLabel}
      </button>
    </form>
  );
}
