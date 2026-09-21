"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { readDivisionIds } from "../first-round-schema";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { removeFirstRoundMatchInDb } from "./repository";
import { removeFirstRoundMatchSchema } from "./schema";
import { removeFirstRoundMatchFromDivision } from "./usecase";

export const removeFirstRoundMatchAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const { slug, tournamentId, divisionId } = readDivisionIds(formData);
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const parsed = removeFirstRoundMatchSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.remove-first-round-match",
    {
      request: parsed.data,
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    removeFirstRoundMatchFromDivision(
      removeFirstRoundMatchInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  // モーダルを閉じる合図。成功の戻り値が毎回同じ形なので、回数で見分ける。
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
