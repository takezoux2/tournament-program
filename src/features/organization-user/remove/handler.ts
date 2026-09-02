"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { removeUserInDb } from "./repository";
import { removeUserSchema } from "./schema";
import { removeUser } from "./usecase";

export const removeUserAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { session, organization } = await requirePermission(
    slug,
    "user.remove",
  );

  const parsed = removeUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 一覧でボタンを隠していても Server Action は直接叩ける。境界はここ。
  // 自分を消せると、権限を持つ最後の 1 人が抜けて誰も操作できなくなり得る。
  if (parsed.data.userId === session.user.id) {
    return { error: "自分自身をこの組織から削除することはできません" };
  }

  const exit = await Effect.runPromiseExit(
    removeUser(removeUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  // 0 件は一覧表示後に所属が消えたことを意味する。存在を漏らさないよう 404。
  if (exit.value.removed === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/users`);
  return { error: null };
};
