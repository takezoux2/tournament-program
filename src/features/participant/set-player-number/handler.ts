"use server";

import { Effect, Exit } from "effect";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidatePlayerNumber } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { setPlayerNumberInDb } from "./repository";
import { setPlayerNumberSchema } from "./schema";
import { setPlayerNumberForParticipant } from "./usecase";

export const setPlayerNumberAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 部門の編集画面から送られたときだけ入る。参加者一覧からは空。
  // 再検証の対象を決めるためだけに使い、絞り込みには使わない。
  const divisionIdValue = String(formData.get("divisionId") ?? "");
  const divisionId = divisionIdValue === "" ? null : divisionIdValue;

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

  const exit = await Effect.runPromiseExit(
    setPlayerNumberForParticipant(
      setPlayerNumberInDb,
      { organizationId: organization.id, tournamentId },
      { ...parsed.data, confirmed },
    ),
  );

  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }
  if (!exit.value.updated) {
    return {
      error: null,
      confirm: {
        message: "同じ番号の選手がすでにいます。もう一度保存すると確定します",
        value: parsed.data.playerNumber,
      },
    };
  }

  revalidatePlayerNumber(slug, tournamentId, divisionId);
  return { error: null };
};
