"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/shared/middleware/require-organization";
import { memberErrorFormState } from "../effect-to-form-state";
import type { MemberFormState } from "../state";
import { addMemberInDb } from "./repository";
import { addMemberSchema } from "./schema";

export const addMemberAction = async (
  _prevState: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requirePermission(slug, "member.add");

  const parsed = addMemberSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addMemberInDb({ ...parsed.data, organizationId: organization.id }),
  );

  if (Exit.isFailure(exit)) {
    return memberErrorFormState(exit.cause);
  }

  // 追加は即時反映。一覧を描き直したいだけなので redirect はしない。
  revalidatePath(`/orgs/${slug}/members`);
  return { error: null };
};
