"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import { findLinkedAccounts } from "../repository";
import type { ProfileFormState } from "../state";
import { unlinkAccount } from "./usecase";

export const unlinkGoogleAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  // 解除対象はセッションのユーザーの連携から引き当てる。accountId を
  // フォームから受け取ると、他人の連携を指す値を送りつけられる口ができる。
  const linkedAccounts = await findLinkedAccounts(session.user.id);
  if (linkedAccounts.google === null) {
    return { error: "Google と連携していません", notice: null };
  }

  const exit = await Effect.runPromiseExit(
    unlinkAccount(
      (input) => auth.api.unlinkAccount(input),
      linkedAccounts.google.accountId,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // 解除後は連携節が「連携する」に切り替わる。サーバで読んだ状態に
  // 依存するため作り直す。
  revalidatePath("/profile");
  return { error: null, notice: "Google との連携を解除しました" };
};
