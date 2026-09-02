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
  const { organization } = await requirePermission(slug, "user.add");

  const parsed = addUserSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addUser(addUserInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  // 追加は即時反映。一覧を描き直したいだけなので redirect はしない。
  revalidatePath(`/orgs/${slug}/users`);
  return { error: null };
};
