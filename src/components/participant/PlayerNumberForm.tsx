"use client";

import { useActionState } from "react";
import {
  INITIAL_PARTICIPANT_FORM_STATE,
  type ParticipantFormAction,
} from "@/features/participant/state";

/**
 * 選手番号のインライン編集。重複時はサーバが confirm を返すので、
 * その値を confirmedNumber として次の送信に積む。番号を変えて送り直すと
 * サーバ側で不一致になり、改めて確認が求められる。
 *
 * divisionId は部門の編集画面から使うときだけ渡す。サーバ側では
 * 再検証の対象を決めるのに使うだけで、絞り込みには使わない。
 */
export function PlayerNumberForm({
  participantId,
  playerNumber,
  participantName,
  slug,
  tournamentId,
  divisionId,
  action,
}: {
  participantId: string;
  playerNumber: string;
  participantName: string;
  slug: string;
  tournamentId: string;
  divisionId?: string;
  action: ParticipantFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PARTICIPANT_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="tournamentId" value={tournamentId} />
        {divisionId !== undefined && (
          <input type="hidden" name="divisionId" value={divisionId} />
        )}
        <input type="hidden" name="participantId" value={participantId} />
        <input
          type="hidden"
          name="confirmedNumber"
          value={state.confirm?.value ?? ""}
        />
        <label
          className="text-xs text-slate-500"
          htmlFor={`pn-${participantId}`}
        >
          選手番号
        </label>
        <input
          id={`pn-${participantId}`}
          type="text"
          name="playerNumber"
          defaultValue={playerNumber}
          aria-label={`${participantName}の選手番号`}
          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-30"
        >
          保存
        </button>
      </div>
      {state.error !== null && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.confirm !== undefined && (
        <output className="text-xs text-amber-700">
          {state.confirm.message}
        </output>
      )}
    </form>
  );
}
