"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { setPlayerNumberInDb } from "./repository";
import { setPlayerNumberSchema } from "./schema";
import { setPlayerNumberForParticipant } from "./usecase";

export const setPlayerNumberAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = setPlayerNumberSchema.safeParse({
    participantId: String(formData.get("participantId") ?? ""),
    playerNumber: String(formData.get("playerNumber") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // 確認フロー: 前回 confirm で返した値と同じ番号の再送だけを「確認済み」と扱う。
  // 確認後に番号を変えて送った場合は改めて確認を求める。
  const confirmedNumber = String(formData.get("confirmedNumber") ?? "");
  const confirmed = confirmedNumber === parsed.data.playerNumber;

  const exit = await runOperationExit(
    "division.set-player-number",
    {
      request: { ...parsed.data, confirmed },
      context: {
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    setPlayerNumberForParticipant(
      setPlayerNumberInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      { ...parsed.data, confirmed },
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  if (!exit.value.value.updated) {
    return {
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: parsed.data.playerNumber,
      },
    };
  }

  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
