"use server";

import { Cause, Effect, Exit, Option } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { organizationErrorMessage } from "../messages";
import type { OrganizationFormState } from "../state";
import { updateOrganizationInDb } from "./repository";
import { updateOrganizationSchema } from "./schema";
import { updateOrganization } from "./usecase";

export const updateOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  // slug が偽装されていても、所属していない組織なら 404 になる。
  const { organization } = await requireOrganization(slug);

  const parsed = updateOrganizationSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateOrganization(updateOrganizationInDb, parsed.data, organization.id),
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
  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}`);
};
