"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { addUserInDb } from "./repository";
import { addUserSchema } from "./schema";
import { addUser } from "./usecase";

export const addUserAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization, permissionCodes } = await requirePermission(
    slug,
    "user.add",
  );

  const parsed = addUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 追加者の権限をそのまま引き継がせる。requirePermission が返した実測値を
  // 使うので、フォームから権限を指定して自分より強いメンバーは作れない。
  const exit = await Effect.runPromiseExit(
    addUser(addUserInDb, parsed.data, organization.id, permissionCodes),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  // 追加は即時反映。一覧を描き直したいだけなので redirect はしない。
  revalidatePath(`/orgs/${slug}/users`);
  return { error: null };
};
