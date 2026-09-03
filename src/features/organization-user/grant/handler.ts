"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { SELF_LOCKED_MESSAGE, strippedSelfLockedCodes } from "./domain";
import { grantPermissionsInDb } from "./repository";
import { grantPermissionsSchema } from "./schema";
import { grantPermissions } from "./usecase";

export const grantPermissionsAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { session, organization, permissionCodes } = await requirePermission(
    slug,
    "user.grant",
  );

  const parsed = grantPermissionsSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    // チェックボックスは同名で複数送られるため getAll で受ける。
    codes: formData.getAll("permissionCode").map((value) => String(value)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 自分から外すと自分を締め出す権限（user.grant / user.view）を守る。
  // 対象が自分なので、requirePermission が返す保有コードがそのまま
  // 対象の保有コードになる。チェックボックスの無効化は体感のためで、境界はここ。
  if (
    parsed.data.userId === session.user.id &&
    strippedSelfLockedCodes(permissionCodes, parsed.data.codes).length > 0
  ) {
    return { error: SELF_LOCKED_MESSAGE };
  }

  const exit = await Effect.runPromiseExit(
    grantPermissions(grantPermissionsInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationUserErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/users`);
  // redirect は例外を投げて制御を打ち切るため、Effect の実行が終わった後に呼ぶ。
  redirect(`/orgs/${slug}/users`);
};
