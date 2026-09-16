"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission } from "@/shared/middleware/require-organization";
import { tournamentErrorFormState } from "../effect-to-form-state";
import { findTournamentInOrganization } from "../repository";
import type { TournamentFormState } from "../state";
import { publishTournamentInDb } from "./repository";
import { publishTournamentSchema } from "./schema";
import { publishTournament } from "./usecase";

// /t/[id] 配下は layout で組織名などを出しており、"page" 既定の再検証では
// /t/[id]/schedule 等の子ページが古いままになる。
const revalidateTournamentPaths = (slug: string, tournamentId: string) => {
  revalidatePath(`/orgs/${slug}`);
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  revalidatePath(`/t/${tournamentId}`, "layout");
};

export const publishTournamentAction = async (
  _prevState: TournamentFormState,
  formData: FormData,
): Promise<TournamentFormState> => {
  const slug = String(formData.get("slug") ?? "");
  // 画面でボタンを隠していても Server Action は直接叩ける。境界はここ。
  const { organization } = await requirePermission(slug, "tournament.edit");

  const parsed = publishTournamentSchema.safeParse({
    tournamentId: String(formData.get("tournamentId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { tournamentId } = parsed.data;

  const exit = await Effect.runPromiseExit(
    publishTournament(publishTournamentInDb, organization.id, tournamentId),
  );

  if (Exit.isFailure(exit)) {
    return tournamentErrorFormState(exit.cause);
  }

  if (exit.value.updated === 0) {
    // 0 件は「組織に無い」か「すでに DRAFT ではない」。前者は存在を漏らさないよう 404。
    const tournament = await findTournamentInOrganization(
      organization.id,
      tournamentId,
    );
    if (!tournament) {
      notFound();
    }
    // 更新 0 件でも再検証する。古い画面がボタンを出したままにならないように。
    revalidateTournamentPaths(slug, tournamentId);
    return { error: "この大会はすでに公開されています" };
  }

  revalidateTournamentPaths(slug, tournamentId);
  return { error: null };
};
