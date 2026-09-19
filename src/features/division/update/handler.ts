"use server";

import { Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { updateDivisionInDb } from "./repository";
import { updateDivisionSchema } from "./schema";
import { updateDivision } from "./usecase";

export const updateDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = updateDivisionSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    format: String(formData.get("format") ?? ""),
    resultConfig: {
      // checkbox はチェックされたときだけ送られてくる。存在の有無を真偽値に直す。
      winReasonEnabled: formData.get("winReasonEnabled") !== null,
      winReasonOptions: String(formData.get("winReasonOptions") ?? ""),
      scoreEnabled: formData.get("scoreEnabled") !== null,
      scoreCount: String(formData.get("scoreCount") ?? ""),
      scoreAggregation: String(formData.get("scoreAggregation") ?? ""),
      noteEnabled: formData.get("noteEnabled") !== null,
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.update",
    {
      request: parsed.data,
      context: {
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    updateDivision(
      updateDivisionInDb,
      parsed.data,
      organization.id,
      tournamentId,
      divisionId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // 0 件は「この組織のこの大会にその部門が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(
    `/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`,
  );
  redirect(`/orgs/${slug}/tournaments/${tournamentId}/divisions/${divisionId}`);
};
