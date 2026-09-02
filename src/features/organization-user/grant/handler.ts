"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { organizationUserErrorFormState } from "../effect-to-form-state";
import type { OrganizationUserFormState } from "../state";
import { grantPermissionsInDb } from "./repository";
import { grantPermissionsSchema } from "./schema";
import { grantPermissions } from "./usecase";

export const grantPermissionsAction = async (
  _prevState: OrganizationUserFormState,
  formData: FormData,
): Promise<OrganizationUserFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { session, organization } = await requirePermission(slug, "user.grant");

  const parsed = grantPermissionsSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    // チェックボックスは同名で複数送られるため getAll で受ける。
    codes: formData.getAll("permissionCode").map((value) => String(value)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 最後の user.grant 保持者が自分から権限を外すと、誰も権限を戻せなくなる。
  // チェックボックスの無効化は体感のためで、境界はここ。
  if (
    parsed.data.userId === session.user.id &&
    !parsed.data.codes.includes("user.grant")
  ) {
    return { error: "自分自身から権限の付与・剥奪の権限は外せません" };
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
