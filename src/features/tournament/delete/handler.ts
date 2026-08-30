"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { deleteTournamentInDb } from "./repository";
import { deleteTournamentSchema } from "./schema";
import { deleteTournament } from "./usecase";

export const deleteTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requireOrganization(slug);

  const tournament = await findTournamentInOrganization(
    organization.id,
    tournamentId,
  );
  if (!tournament) {
    notFound();
  }

  const parsed = deleteTournamentSchema.safeParse({
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // クライアント側の入力チェックは体感のためのもので、境界はここ。
  if (parsed.data.confirmName !== tournament.name) {
    return { error: "大会名が一致しません" };
  }

  const exit = await Effect.runPromiseExit(
    deleteTournament(deleteTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  // 0 件は「この組織にその大会が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.deleted === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}`);
  redirect(`/orgs/${slug}`);
};
