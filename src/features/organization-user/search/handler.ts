"use server";

import { Effect, Exit } from "effect";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorSearchState } from "../effect-to-form-state";
import type { UserSearchState } from "../state";
import { searchUserInDb } from "./repository";
import { searchUserSchema } from "./schema";
import { searchUser } from "./usecase";

export const searchUserAction = async (
  _prevState: UserSearchState,
  formData: FormData,
): Promise<UserSearchState> => {
  const slug = String(formData.get("slug") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // 検索はユーザーの存在を照会する操作なので user.add で守る。
  const { organization } = await requirePermission(slug, "user.add");

  const parsed = searchUserSchema.safeParse({
    query: String(formData.get("query") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, user: null };
  }

  const exit = await Effect.runPromiseExit(
    searchUser(searchUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorSearchState(exit.cause);
  }

  return { error: null, user: exit.value };
};
