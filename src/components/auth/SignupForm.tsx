"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import { signupSchema } from "@/features/auth/signup/schema";
import { signup } from "@/features/auth/signup/usecase";
import { authClient } from "@/shared/lib/auth-client";
import { runAuthCall } from "@/shared/lib/auth-effect";
import { MIN_PASSWORD_LENGTH } from "@/shared/lib/password-policy";

export function SignupForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      signup((input) => authClient.signUp.email(input), parsed.data),
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

    // autoSignIn: true のため、登録が済めばそのままログイン済みになる。
    router.push(redirectTo);
    router.refresh();
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setPending(true);
    // メール/パスワードの signup と同じ runAuthCall を通し、reject と
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
      <h1 className="text-xl font-bold text-slate-800">新規登録</h1>

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-700"
          >
            名前
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

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
            autoComplete="new-password"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            {MIN_PASSWORD_LENGTH} 文字以上
          </p>
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
          {pending ? "登録中..." : "登録する"}
        </button>
      </form>

      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={pending}
        className="w-full rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        Google で登録
      </button>

      <p className="text-sm text-slate-600">
        既にアカウントをお持ちの方は{" "}
        <Link href="/login" className="underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
