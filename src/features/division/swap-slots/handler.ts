"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { swapSlotsInDb } from "./repository";
import { swapSlotsSchema } from "./schema";
import { swapSlotsForDivision } from "./usecase";

export const swapSlotsAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = swapSlotsSchema.safeParse({
    indexA: String(formData.get("indexA") ?? ""),
    indexB: String(formData.get("indexB") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    swapSlotsForDivision(
      swapSlotsInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  // swapped: false は「範囲外の指定」か「同じスロット」。どちらも画面上は
  // 何も起きなかったのと同じで、エラーにする必要はない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null };
};
