"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { organizationErrorFormState } from "../effect-to-form-state";
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
    return organizationErrorFormState(exit.cause);
  }

  // 0 件はページ表示後に組織が消えたことを意味する。存在を漏らさないよう 404。
  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath("/");
  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}`);
};
