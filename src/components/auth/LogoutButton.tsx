"use client";

import { Cause, Effect, Exit, Option } from "effect";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authErrorMessage } from "@/features/auth/messages";
import { authClient } from "@/shared/lib/auth-client";
import { runAuthCall } from "@/shared/lib/auth-effect";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setError(null);
    setPending(true);
    // LoginForm/SignupForm と同じく runAuthCall を通すことで、
    // reject と { error } の両経路を AuthError に畳んでから扱う。
    const exit = await Effect.runPromiseExit(
      runAuthCall(() => authClient.signOut(), undefined),
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

    router.push("/login");
    // Server Component 側のセッションを読み直させる。
    router.refresh();
  };

  return (
    <div className="space-y-1">
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
      >
        {pending ? "ログアウト中..." : "ログアウト"}
      </button>
    </div>
  );
}
