"use server";

import { Effect, Exit } from "effect";
import { requirePermission } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidateParticipants } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { removeParticipantInDb } from "./repository";
import { removeParticipantSchema } from "./schema";
import { removeParticipant } from "./usecase";

export const removeParticipantAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 一覧でボタンを無効にしていても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = removeParticipantSchema.safeParse({
    participantId: String(formData.get("participantId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeParticipant(
      removeParticipantInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  // 対象が見つからないのは、一覧を描いたあとに誰かが消した場合が主。
  // ページごと 404 にせず、行内のエラー文言として返す。
  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }

  revalidateParticipants(slug, tournamentId);
  return { error: null };
};
