"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { organizationErrorMessage } from "../messages";
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
    const failure = Cause.failureOption(exit.cause);
    return {
      error: Option.isSome(failure)
        ? organizationErrorMessage(failure.value)
        : "処理に失敗しました。時間をおいて再度お試しください",
    };
  }

  revalidatePath("/");
  redirect("/");
};
