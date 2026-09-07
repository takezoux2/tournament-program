"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";

/**
 * 解除ボタンを押せなくするのは体感のためで、境界ではない。
 * 最後の 1 つの解除は Better Auth 自身が FAILED_TO_UNLINK_LAST_ACCOUNT で
 * 拒む。ここで無効にしておくのは、押す前に理由が読めるようにするため。
 */
export function LinkedAccountsSection({
  google,
  hasPassword,
  linkAction,
  unlinkAction,
}: {
  google: { accountId: string; linkedAt: Date } | null;
  hasPassword: boolean;
  linkAction: ProfileFormAction;
  unlinkAction: ProfileFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    google === null ? linkAction : unlinkAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  const canUnlink = hasPassword;

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Google</p>
          <p className="text-xs text-slate-500">
            {google === null
              ? "連携していません"
              : `${google.linkedAt.toLocaleDateString("ja-JP")} 連携`}
          </p>
        </div>

        {google === null ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {pending ? "処理中..." : "Google と連携する"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || !canUnlink}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            {pending ? "処理中..." : "連携を解除"}
          </button>
        )}
      </div>

      {google !== null && !canUnlink && (
        <p className="text-xs text-slate-500">
          唯一のログイン方法のため解除できません。先にパスワードを設定してください
        </p>
      )}

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
    </form>
  );
}
