"use server";

import { Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createdQuery } from "@/shared/lib/analytics/created";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { createDivisionInDb } from "./repository";
import { createDivisionSchema } from "./schema";
import { createDivision } from "./usecase";

export const createDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // ページで確認済みでも Server Action は独立した入口なので、ここでも呼ぶ。
  const { organization } = await requireOrganization(slug);

  const parsed = createDivisionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    format: String(formData.get("format") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.create",
    {
      request: parsed.data,
      // 部門はこれから作るので divisionId はまだ無い。
      context: { organizationId: organization.id, tournamentId },
    },
    createDivision(
      createDivisionInDb,
      parsed.data,
      organization.id,
      tournamentId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // null は「この組織にその大会が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value === null) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(
    `/orgs/${slug}/tournaments/${tournamentId}/divisions/${exit.value.id}${createdQuery("division")}`,
  );
};
