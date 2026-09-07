"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { setPasswordSchema } from "./schema";
import { setPassword } from "./usecase";

export const setPasswordAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // 画面が設定フォームを出しているかどうかは境界にならない。
  await requireSession();

  const parsed = setPasswordSchema.safeParse({
    newPassword: String(formData.get("newPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  const exit = await Effect.runPromiseExit(
    setPassword(
      (input) => auth.api.setPassword(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 設定後はパスワード節が「変更」に切り替わり、Google 連携の解除も
  // できるようになる。どちらもサーバで読んだ状態に依存するため作り直す。
  revalidatePath("/profile");
  return { error: null, notice: "パスワードを設定しました" };
};
