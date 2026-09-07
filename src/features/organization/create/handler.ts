"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/shared/middleware/require-session";
import { organizationErrorFormState } from "../effect-to-form-state";
import type { OrganizationFormState } from "../state";
import { createOrganizationInDb } from "./repository";
import { createOrganizationSchema } from "./schema";
import { createOrganization } from "./usecase";

export const createOrganizationAction = async (
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> => {
  const session = await requireSession();

  const parsed = createOrganizationSchema.safeParse({
    // FormData は null を返しうる。空文字に寄せることで、型のエラーではなく
    // 「入力してください」という人間向けの文言に落ちる。
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createOrganization(createOrganizationInDb, parsed.data, session.user.id),
  );

  if (Exit.isFailure(exit)) {
    return organizationErrorFormState(exit.cause);
  }

  revalidatePath("/");
  // redirect は例外を投げて制御を打ち切るため、Effect の実行が終わった後に呼ぶ。
  // ?created= は遷移先の TrackCreated が GA イベントを撃つための印。
  // 撃った直後にクエリは消される。
  redirect(`/orgs/${exit.value.slug}?created=organization`);
};
