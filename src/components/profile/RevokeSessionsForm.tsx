"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

export function RevokeSessionsForm({ action }: { action: ProfileFormAction }) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-slate-500">
        この端末のログインは維持されます。他の端末では再度ログインが必要になります
      </p>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        // <output> は role="status" を暗黙に持つため、Biome の
        // useSemanticElements ルールを満たしつつ、テストやスクリーンリーダー
        // からは role="status" として見える(LoginForm と同じ扱い)。
        <output className="text-sm text-emerald-700">{state.notice}</output>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
      >
        {pending ? "処理中..." : "他の端末をログアウト"}
      </button>
    </form>
  );
}
