"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { verificationNotice } from "@/features/auth/domain";
import { loginSchema } from "@/features/auth/login/schema";
import { login } from "@/features/auth/login/usecase";
import { authErrorMessage } from "@/features/auth/messages";
import { authClient } from "@/shared/lib/auth-client";
import { runAuthCall } from "@/shared/lib/auth-effect";

export function LoginForm({
  redirectTo,
  verified = false,
  verifyError = null,
}: {
  redirectTo: string;
  verified?: boolean;
  verifyError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const notice = verificationNotice(verified, verifyError);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      login((input) => authClient.signIn.email(input), parsed.data),
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

    router.push(redirectTo);
    // Server Component 側のセッションを読み直させる。
    router.refresh();
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setPending(true);
    // メール/パスワードの login と同じ runAuthCall を通し、reject と
    // { error } の両経路を AuthError に畳んでから扱う。
    const exit = await Effect.runPromiseExit(
      runAuthCall((input) => authClient.signIn.social(input), {
        provider: "google" as const,
        callbackURL: redirectTo,
      }),
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

    // 成功時は signIn.social 自身がブラウザを Google の認証画面へ
    // 遷移させるため、ここでの router.push は不要。
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <h1 className="text-xl font-bold text-slate-800">ログイン</h1>

      {notice !== null && (
        // <output> は role="status" を暗黙に持つため、Biome の
        // useSemanticElements ルール（role をベタ書きせず対応する
        // セマンティック要素を使う）を満たしつつ、テストや
        // スクリーンリーダーからは role="status" として見える。
        <output className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {notice}
        </output>
      )}

      <form action={onSubmit} className="space-y-4">
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

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
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
          {pending ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={pending}
        className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        Google でログイン
      </button>

      <p className="text-sm text-slate-600">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}
