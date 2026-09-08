"use client";

import { Cause, Effect, Exit, Option } from "effect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  verificationCallbackURL,
  verificationNotice,
} from "@/features/auth/domain";
import { loginSchema } from "@/features/auth/login/schema";
import { login } from "@/features/auth/login/usecase";
import { authErrorMessage } from "@/features/auth/messages";
import { passwordResetNotice } from "@/features/auth/password-reset/domain";
import { authClient } from "@/shared/lib/auth-client";
import { runAuthCall } from "@/shared/lib/auth-effect";

// ログイン成功後の遷移先。redirect クエリの行き先は使わず、常にトップへ戻す。
const LOGIN_DESTINATION = "/";

export function LoginForm({
  redirectTo,
  verified = false,
  verifyError = null,
  reset = false,
}: {
  redirectTo: string;
  verified?: boolean;
  verifyError?: string | null;
  reset?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // form action は完了後にフォームをリセットするため、識別子は state で
  // 保持する。そうしないとログイン失敗のたびに入力し直しになる。
  const [identifier, setIdentifier] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  // 案内の枠は 1 つしか出さない。確認メール由来とリセット由来が同時に
  // 付く経路は無いが、付いた場合は確認メール側を優先する（ログインできる
  // かどうかに直結するのはそちらのため）。
  const notice =
    verificationNotice(verified, verifyError) ?? passwordResetNotice(reset);

  const onSubmit = async (formData: FormData) => {
    setError(null);

    const parsed = loginSchema.safeParse({
      identifier: formData.get("identifier"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setPending(true);
    const exit = await Effect.runPromiseExit(
      login(
        {
          signInEmail: (input) => authClient.signIn.email(input),
          signInUsername: (input) => authClient.signIn.username(input),
        },
        parsed.data,
        verificationCallbackURL(redirectTo),
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

    router.push(LOGIN_DESTINATION);
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
        callbackURL: LOGIN_DESTINATION,
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
        <output className="block rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {notice}
        </output>
      )}

      <form action={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="identifier"
            className="block text-sm font-medium text-slate-700"
          >
            ユーザー名またはメールアドレス
          </label>
          {/* type="email" にするとブラウザの検証がユーザー名を送信前に弾く。 */}
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
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
          <div className="relative">
            <input
              id="password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              className="w-full rounded border border-slate-300 py-2 pr-10 pl-3 text-sm"
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={
                passwordVisible ? "パスワードを非表示" : "パスワードを表示"
              }
              aria-pressed={passwordVisible}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
            >
              <EyeIcon off={passwordVisible} />
            </button>
          </div>
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
        <Link href="/forgot-password" className="underline">
          パスワードをお忘れですか？
        </Link>
      </p>

      <p className="text-sm text-slate-600">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="underline">
          新規登録
        </Link>
      </p>
    </div>
  );
}

// 目のアイコン。off=true のときは表示中（クリックで隠す）を表す斜線付き。
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <title>パスワードの表示切り替え</title>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="m3 3 18 18" />}
    </svg>
  );
}
