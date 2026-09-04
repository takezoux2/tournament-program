"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { memberErrorFormState } from "../effect-to-form-state";
import { MemberNotFound } from "../errors";
import { memberErrorMessage } from "../messages";
import type { MemberFormState } from "../state";
import { removeMemberInDb } from "./repository";
import { removeMemberSchema } from "./schema";

export const removeMemberAction = async (
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 一覧でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "member.remove");

  const parsed = removeMemberSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeMemberInDb({
      memberId: parsed.data.memberId,
      organizationId: organization.id,
    }),
  );

  if (Exit.isFailure(exit)) {
    return memberErrorFormState(exit.cause);
  }

  // 0 件は一覧表示後にメンバーが消えたか、他組織の ID を渡されたことを意味する。
  // Member はこの画面の外（部門エントリー）からも消え得るため、404 ではなく
  // 行内のエラー文言として返す。
  if (exit.value.removed === 0) {
    return {
      error: memberErrorMessage(
        new MemberNotFound({ memberId: parsed.data.memberId }),
      ),
    };
  }

  revalidatePath(`/orgs/${slug}/members`);
  return { error: null };
};
