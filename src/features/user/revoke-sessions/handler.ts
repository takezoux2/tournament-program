"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { runAuthApiCall } from "@/shared/lib/auth-effect";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";

/**
 * 現在のセッション以外を破棄する。対象はセッション（Cookie）が決めるため、
 * フォームから受け取る値が無く、schema.ts も usecase.ts も要らない。
 */
export const revokeOtherSessionsAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const exit = await Effect.runPromiseExit(
    runAuthApiCall((input) => auth.api.revokeOtherSessions(input), {
      headers: await headers(),
    }),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  return { error: null, notice: "この端末以外のログインを解除しました" };
};
