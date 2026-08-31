"use client";

import { useActionState, useState } from "react";
import {
  type DivisionFormAction,
  INITIAL_DIVISION_FORM_STATE,
} from "@/features/division/state";

export function DeleteDivisionForm({
  action,
  divisionName,
  slug,
  tournamentId,
  divisionId,
}: {
  action: DivisionFormAction;
  divisionName: string;
  slug: string;
  tournamentId: string;
  divisionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DIVISION_FORM_STATE,
  );
  const [confirmName, setConfirmName] = useState("");

  return (
    <form
      action={formAction}
      className="space-y-3 rounded border border-red-200 bg-red-50 p-4"
    >
      <h2 className="text-sm font-bold text-red-800">部門を削除</h2>
      <p className="text-xs text-red-700">
        エントリー・組み合わせ・勝敗記録もすべて削除されます。元に戻せません。
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="divisionId" value={divisionId} />

      <div className="space-y-1">
        <label
          htmlFor="confirmName"
          className="block text-sm font-medium text-red-800"
        >
          確認のため部門名を入力
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
        disabled={pending || confirmName !== divisionName}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "削除中..." : "この部門を削除する"}
      </button>
    </form>
  );
}
