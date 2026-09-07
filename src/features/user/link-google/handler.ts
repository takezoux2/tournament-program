"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/shared/lib/auth";
import { type AuthApiPort, runAuthApiCall } from "@/shared/lib/auth-effect";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";

/** auth.api.linkSocialAccount が満たす最小の形。url を返す。 */
export type LinkGooglePort = AuthApiPort<
  {
    body: {
      provider: "google";
      callbackURL: string;
      errorCallbackURL: string;
    };
    headers: Headers;
  },
  { url: string }
>;

export const linkGoogleAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  // 宣言した port の型を実際に通すことで、better-auth の戻り値が
  // { url } を持たなくなったらここで型エラーになる。
  const linkGoogle: LinkGooglePort = (input) =>
    auth.api.linkSocialAccount(input);

  const exit = await Effect.runPromiseExit(
    runAuthApiCall(linkGoogle, {
      body: {
        provider: "google" as const,
        // 成否どちらでもプロフィールへ戻す。連携の結果は画面の表示で分かる。
        callbackURL: "/profile",
        errorCallbackURL: "/profile",
      },
      headers: await headers(),
    }),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // disableRedirect を渡していないので通常は必ず url が返る。空で返るのは
  // 想定外なので、遷移させずエラーとして見せる(空文字へ redirect すると
  // 何が起きたか分からない画面になる)。
  if (!exit.value.url) {
    return {
      error: "処理に失敗しました。時間をおいて再度お試しください",
      notice: null,
    };
  }

  // Google の認証画面はこのアプリの外にある。redirect は例外を投げて
  // 制御を打ち切るため、これ以降は実行されない。
  redirect(exit.value.url);
};
