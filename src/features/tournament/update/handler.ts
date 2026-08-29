"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import type { TournamentFormState } from "../state";
import { updateTournamentInDb } from "./repository";
import { updateTournamentSchema } from "./schema";
import { updateTournament } from "./usecase";

export const updateTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = updateTournamentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    updateTournament(
      updateTournamentInDb,
      parsed.data,
      organization.id,
      tournamentId,
    ),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  // 0 件は「この組織にその大会が無い」を意味する。存在を漏らさないよう 404。
  if (exit.value.updated === 0) {
    notFound();
  }

  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
