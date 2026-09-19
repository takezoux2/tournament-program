"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { participantErrorFormState } from "../effect-to-form-state";
import { revalidateParticipants } from "../revalidate";
import type { ParticipantFormState } from "../state";
import { addParticipantInDb } from "./repository";
import { addParticipantSchema } from "./schema";
import { addParticipant } from "./usecase";

export const addParticipantAction = async (
  _prevState: ParticipantFormState,
  formData: FormData,
): Promise<ParticipantFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  // 一覧でフォームを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  // mode に応じて要る項目が変わるので、両方の項目をそのまま渡して
  // discriminatedUnion に選ばせる。
  const parsed = addParticipantSchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    addParticipant(
      addParticipantInDb,
      { organizationId: organization.id, tournamentId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return participantErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  revalidateParticipants(slug, tournamentId);
  return { error: null };
};
