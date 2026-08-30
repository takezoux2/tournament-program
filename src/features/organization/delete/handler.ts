"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { organizationErrorFormState } from "../effect-to-form-state";
import type { OrganizationFormState } from "../state";
import { deleteOrganizationInDb } from "./repository";
import { deleteOrganizationSchema } from "./schema";
import { deleteOrganization } from "./usecase";

export const deleteOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = deleteOrganizationSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  // Server Action は誰でも直接叩ける。
  if (parsed.data.confirmName !== organization.name) {
    return { error: "組織名が一致しません" };
  }

  const exit = await Effect.runPromiseExit(
    deleteOrganization(deleteOrganizationInDb, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationErrorFormState(exit.cause);
  }

  // 0 件は確認フォーム表示後に組織が消えたことを意味する。存在を漏らさないよう 404。
  if (exit.value.deleted === 0) {
    notFound();
  }

  revalidatePath("/");
  redirect("/");
};
