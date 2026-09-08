"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

export function DisplayNameForm({
  action,
  defaultName,
}: {
  action: ProfileFormAction;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="profile-name"
          className="block text-sm font-medium text-slate-700"
        >
          表示名
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">
          ヘッダーや組織のメンバー一覧に表示されます
        </p>
      </div>

      {state.error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.notice !== null && (
        // <output> は role="status" を暗黙に持つため、Biome の
        // useSemanticElements ルールを満たしつつ、テストやスクリーンリーダー
        // からは role="status" として見える（LoginForm と同じ扱い）。
        <output className="text-sm text-emerald-700">{state.notice}</output>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "保存中..." : "表示名を保存"}
      </button>
    </form>
  );
}
