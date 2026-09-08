"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { changePasswordSchema } from "./schema";
import { changePassword } from "./usecase";

export const changePasswordAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  const exit = await Effect.runPromiseExit(
    changePassword(
      (input) => auth.api.changePassword(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 画面に出ている情報は変わらないため revalidatePath は要らない。
  return { error: null, notice: "パスワードを変更しました" };
};
