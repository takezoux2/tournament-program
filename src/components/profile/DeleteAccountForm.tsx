"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

/**
 * 押しても削除は起きず、確認メールが送られるだけ。そのため
 * window.confirm による二重確認は置かない。誤って押しても、
 * メールのリンクを開かなければ何も起きない。
 */
export function DeleteAccountForm({ action }: { action: ProfileFormAction }) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-xs text-slate-500">
        確認メールのリンクを開くまで削除されません。削除すると所属している組織からも外れ、元に戻せません
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
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
      >
        {pending ? "送信中..." : "アカウントを削除"}
      </button>
    </form>
  );
}
