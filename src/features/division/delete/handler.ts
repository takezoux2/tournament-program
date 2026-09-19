"use server";

import { Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { findDivisionInTournament } from "../repository";
import type { DivisionFormState } from "../state";
import { deleteDivisionInDb } from "./repository";
import { deleteDivisionSchema } from "./schema";
import { deleteDivision } from "./usecase";

export const deleteDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const division = await findDivisionInTournament(
    organization.id,
    tournamentId,
    divisionId,
  );
  if (!division) {
    notFound();
  }

  const parsed = deleteDivisionSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  if (parsed.data.confirmName !== division.name) {
    return { error: "部門名が一致しません" };
  }

  const exit = await runOperationExit(
    "division.delete",
    {
      request: parsed.data,
      context: {
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    deleteDivision(
      deleteDivisionInDb,
      organization.id,
      tournamentId,
      divisionId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // 0 件は「この組織のこの大会にその部門が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.deleted === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
