"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { readDivisionIds, slotTargetSchema } from "../first-round-schema";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { clearSlotInDb } from "./repository";
import { clearSlotInDivision } from "./usecase";

export const clearSlotAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const { slug, tournamentId, divisionId } = readDivisionIds(formData);
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const target = slotTargetSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    slotIndex: String(formData.get("slotIndex") ?? ""),
  });
  if (!target.success) {
    return { error: target.error.issues[0].message };
  }
  const input = target.data;

  const exit = await runOperationExit(
    "division.clear-slot",
    {
      request: input,
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    clearSlotInDivision(
      clearSlotInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      input,
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
