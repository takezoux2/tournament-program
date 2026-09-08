"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import { passwordResetRequestSchema } from "@/features/auth/password-reset/schema";
import { requestPasswordReset } from "@/features/auth/password-reset/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "@/shared/lib/password-reset-policy";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 申し込んだメールアドレス。null なら未送信でフォームを出す。
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = passwordResetRequestSchema.safeParse({
      email: formData.get("email"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      requestPasswordReset(
        (input) => authClient.requestPasswordReset(input),
        parsed.data,
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

    // Better Auth はアカウントが無くても成功を返す（列挙対策）。
    // そのため、ここは「送った」ではなく「受け付けた」の意味になる。
    setSentTo(parsed.data.email);
  };

  if (sentTo !== null) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-800">
          リセット用のリンクを送信しました
        </h1>
        <p className="text-sm text-slate-700">
          {sentTo}{" "}
          宛のメールにあるリンクを開くと、新しいパスワードを設定できます。
        </p>
        <p className="text-xs text-slate-500">
          リンクの有効期限は{PASSWORD_RESET_LINK_EXPIRES_LABEL}
          です。メールが届かない場合は迷惑メールフォルダをご確認ください。
          そのメールアドレスで登録されていない場合、メールは届きません。
        </p>
        <Link href="/login" className="text-sm text-slate-600 underline">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">パスワードの再設定</h1>

      <p className="text-sm text-slate-700">
        登録したメールアドレスを入力してください。再設定用のリンクをお送りします。
      </p>

      {/* noValidate: type="email" のブラウザ検証に任せると、無効な入力時に
          submit イベント自体が発火せず（jsdom もこの挙動を再現する）、
          passwordResetRequestSchema による日本語エラーが出せなくなる。
          検証の主導権をスキーマ側に一本化するため無効化する。 */}
      <form action={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
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
          {pending ? "送信中..." : "リセット用リンクを送る"}
        </button>
      </form>

      <p className="text-sm text-slate-600">
        <Link href="/login" className="underline">
          ログイン画面へ戻る
        </Link>
      </p>
    </div>
  );
}
