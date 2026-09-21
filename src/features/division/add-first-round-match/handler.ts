"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { readDivisionIds } from "../first-round-schema";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { addFirstRoundMatchInDb } from "./repository";
import { addFirstRoundMatchToDivision } from "./usecase";

export const addFirstRoundMatchAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const { slug, tournamentId, divisionId } = readDivisionIds(formData);
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const exit = await runOperationExit(
    "division.add-first-round-match",
    {
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    addFirstRoundMatchToDivision(addFirstRoundMatchInDb, {
      organizationId: organization.id,
      tournamentId,
      divisionId,
    }),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
