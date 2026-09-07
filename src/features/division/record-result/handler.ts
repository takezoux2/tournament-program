"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionResults } from "../revalidate";
import type { DivisionFormState } from "../state";
import { recordResultInDb } from "./repository";
import { recordResultSchema } from "./schema";
import { recordResultForDivision } from "./usecase";

export const recordResultAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = recordResultSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    winnerEntryId: String(formData.get("winnerEntryId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    recordResultForDivision(
      recordResultInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionResults(slug, tournamentId, divisionId);
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
