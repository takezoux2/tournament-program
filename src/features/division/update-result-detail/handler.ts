"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionResults } from "../revalidate";
import type { DivisionFormState } from "../state";
import { updateResultDetailInDb } from "./repository";
import { updateResultDetailSchema } from "./schema";
import { updateResultDetailForDivision } from "./usecase";

/**
 * スコアの欄名は score_<entryId>。index を名前に入れず getAll の順（＝DOM の順）を
 * そのまま使う。サーバ側は entryId を信用せず、repository がその試合に立っている
 * 2 人と突き合わせて捨てる。
 *
 * 同じ scoreEntryId が重なって届いたら最初の 1 件だけ残す。重なったまま渡すと
 * スキーマの「2 件まで」に掛かったり、同じ人のスコアが 2 件保存されたりする。
 */
const readScores = (formData: FormData) =>
  [...new Set(formData.getAll("scoreEntryId").map(String))].map((entryId) => ({
    entryId,
    values: formData.getAll(`score_${entryId}`).map((value) => {
      const text = String(value).trim();
      return text === "" ? null : Number(text);
    }),
  }));

export const updateResultDetailAction = async (
  prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization, session } = await requireOrganization(slug);

  const parsed = updateResultDetailSchema.safeParse({
    matchId: String(formData.get("matchId") ?? ""),
    winReason: String(formData.get("winReason") ?? ""),
    scores: readScores(formData),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.update-result-detail",
    {
      request: parsed.data,
      context: {
        userId: session.user.id,
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    updateResultDetailForDivision(
      updateResultDetailInDb,
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
  // 成功時の戻り値が初期状態と同じ形になるので、record-result と同じく
  // 増えるカウンタで「今回成功した」ことを画面に伝える。
  return { error: null, succeeded: (prevState.succeeded ?? 0) + 1 };
};
