"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { updateNameSchema } from "./schema";
import { updateName } from "./usecase";

export const updateNameAction = async (
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  await requireSession();

  const parsed = updateNameSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, notice: null };
  }

  // 誰の名前を変えるかはセッション（Cookie）が決める。userId をフォームから
  // 受け取らないので、他人の行を書き換える経路が存在しない。
  const exit = await Effect.runPromiseExit(
    updateName(
      (input) => auth.api.updateUser(input),
      parsed.data,
      await headers(),
    ),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // ヘッダーのユーザー名は全ページに出るため、レイアウトごと作り直させる。
  revalidatePath("/", "layout");
  return { error: null, notice: "表示名を変更しました" };
};
