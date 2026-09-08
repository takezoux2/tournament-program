"use server";

import { Effect, Exit } from "effect";
import { headers } from "next/headers";
import { findSoleGranterOrganizations } from "@/shared/authz/sole-granter";
import { auth } from "@/shared/lib/auth";
import { requireSession } from "@/shared/middleware/require-session";
import { profileErrorFormState } from "../effect-to-form-state";
import type { ProfileFormState } from "../state";
import { soleGranterMessage } from "./domain";
import { deleteAccount } from "./usecase";

export const deleteAccountAction = async (
  _prevState: ProfileFormState,
  _formData: FormData,
): Promise<ProfileFormState> => {
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const session = await requireSession();

  // 孤児化ガードの先出し。境界は auth.ts の beforeDelete フックのほうで、
  // ここで弾くのは「メールを開いてリンクを踏んだ後で初めて断られる」
  // という体験にしないため。
  const soleGranterOrganizations = await findSoleGranterOrganizations(
    session.user.id,
  );
  if (soleGranterOrganizations.length > 0) {
    return {
      error: soleGranterMessage(soleGranterOrganizations),
      notice: null,
    };
  }

  const exit = await Effect.runPromiseExit(
    deleteAccount((input) => auth.api.deleteUser(input), await headers()),
  );

  if (Exit.isFailure(exit)) {
    return profileErrorFormState(exit.cause);
  }

  // sendDeleteAccountVerification が設定されているため、この時点では
  // まだ削除されていない。
  return {
    error: null,
    notice:
      "確認メールを送信しました。ログイン中のこのブラウザでリンクを開くと削除されます",
  };
};
