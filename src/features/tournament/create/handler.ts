"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createdQuery } from "@/shared/lib/analytics/created";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import type { TournamentFormState } from "../state";
import { createTournamentInDb } from "./repository";
import { createTournamentSchema } from "./schema";
import { createTournament } from "./usecase";

export const createTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = createTournamentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    createTournament(createTournamentInDb, parsed.data, organization.id),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  revalidatePath(`/orgs/${slug}`);
  redirect(
    `/orgs/${slug}/tournaments/${exit.value.id}${createdQuery("tournament")}`,
  );
};
