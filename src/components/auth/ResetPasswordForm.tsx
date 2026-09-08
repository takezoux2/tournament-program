"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import {
  PASSWORD_RESET_DONE_PATH,
  resetTokenState,
} from "@/features/auth/password-reset/domain";
import { passwordResetSchema } from "@/features/auth/password-reset/schema";
import { resetPassword } from "@/features/auth/password-reset/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

export function ResetPasswordForm({
  token,
  errorCode,
}: {
  token: string | null;
  errorCode: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const state = resetTokenState(token, errorCode);

  // フォームを出す前にトークンを見るのは、入力させてから弾くより早く
  // 「もう一度申し込む」へ誘導できるため。送信時の INVALID_TOKEN
  // （申し込み直後に期限が切れた場合など）は下の分岐で拾う。
  if (state.kind === "invalid") {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800">
          パスワードを再設定できません
        </h1>
        <p className="text-sm text-slate-700">{state.message}</p>
        <Link
          href="/forgot-password"
          className="text-sm text-slate-600 underline"
        >
          パスワードの再設定を申し込む
        </Link>
      </div>
    );
  }

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = passwordResetSchema.safeParse({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      resetPassword(
        (input) => authClient.resetPassword(input),
        parsed.data,
        state.token,
      ),
    );
    setPending(false);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      setError(
        Option.isSome(failure)
          ? authErrorMessage(failure.value)
          : "処理に失敗しました。時間をおいて再度お試しください",
      );
      return;
    }

    // revokeSessionsOnPasswordReset により既存セッションは失効しており、
    // ここでセッションが発行されることもない。読み直すものが無いので
    // router.refresh() は呼ばない。
    router.push(PASSWORD_RESET_DONE_PATH);
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">
        新しいパスワードの設定
      </h1>

      {/* noValidate: type="password" の required だけでも、空欄のまま
          送信するとブラウザの既定検証が先に止め（jsdom もこの挙動を
          再現する）、passwordResetSchema による日本語エラーが出せなく
          なる。検証の主導権をスキーマ側に一本化するため無効化する。 */}
      <form action={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="newPassword"
            className="block text-sm font-medium text-slate-700"
          >
            新しいパスワード
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            {MIN_PASSWORD_LENGTH} 文字以上
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-slate-700"
          >
            新しいパスワード（確認）
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "設定中..." : "パスワードを設定する"}
        </button>
      </form>

      <p className="text-xs text-slate-500">
        設定すると、他の端末でのログインは解除されます。
      </p>
    </div>
  );
}
