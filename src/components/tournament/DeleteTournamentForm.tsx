"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_TOURNAMENT_FORM_STATE,
  type TournamentFormAction,
} from "@/features/tournament/state";

export function DeleteTournamentForm({
  action,
  tournamentName,
  slug,
  tournamentId,
}: {
  action: TournamentFormAction;
  tournamentName: string;
  slug: string;
  tournamentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_TOURNAMENT_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">大会を削除</h2>
      <p className="text-xs text-red-700">
        この大会に属する部門もすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため大会名を入力
        </label>
        <input
          id="confirmName"
          name="confirmName"
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          className="w-full rounded border border-red-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        // 活性の判定は体感のためで、境界ではない。一致は handler が DB と突き合わせる。
        disabled={pending || confirmName !== tournamentName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この大会を削除する"}
      </button>
    </form>
  );
}
