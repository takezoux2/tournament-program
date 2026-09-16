"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { unpublishTournamentInDb } from "./repository";
import { unpublishTournamentSchema } from "./schema";
import { unpublishTournament } from "./usecase";

export const unpublishTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 画面でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = unpublishTournamentSchema.safeParse({
    tournamentId: String(formData.get("tournamentId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { tournamentId } = parsed.data;

  const exit = await Effect.runPromiseExit(
    unpublishTournament(unpublishTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    // 0 件は「組織に無い」か「すでに DRAFT」。前者は存在を漏らさないよう 404。
    const tournament = await findTournamentInOrganization(
      organization.id,
      tournamentId,
    );
    if (!tournament) {
      notFound();
    }
    return { error: "この大会はすでに非公開です" };
  }

  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(`/t/${tournamentId}`);
  redirect(`/orgs/${slug}/tournaments/${tournamentId}`);
};
