"use client";

import { useActionState } from "react";
import {
  INITIAL_PROFILE_FORM_STATE,
  type ProfileFormAction,
} from "@/features/user/state";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

/**
 * 設定済みか未設定かで別のフォームを出す。どちらを出すかは体感のためで、
 * 境界ではない。Server Action は画面の分岐を信じず、Better Auth 側の
 * 検証(PASSWORD_ALREADY_SET / CREDENTIAL_ACCOUNT_NOT_FOUND)を必ず通す。
 */
export function PasswordSection({
  hasPassword,
  changeAction,
  setAction,
}: {
  hasPassword: boolean;
  changeAction: ProfileFormAction;
  setAction: ProfileFormAction;
}) {
  const [state, formAction, pending] = useActionState(
    hasPassword ? changeAction : setAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      {hasPassword ? (
        <div className="space-y-1">
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-slate-700"
          >
            現在のパスワード
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          設定すると、メールアドレスとパスワードでもログインできるようになります
        </p>
      )}

      <div className="space-y-1">
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-slate-700"
        >
          新しいパスワード
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-500">{MIN_PASSWORD_LENGTH} 文字以上</p>
      </div>

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
        className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending
          ? "送信中..."
          : hasPassword
            ? "パスワードを変更"
            : "パスワードを設定"}
      </button>
    </form>
  );
}
