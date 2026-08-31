"use server";

import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import type { DivisionFormState } from "../state";
import { reorderDivisionInDb } from "./repository";
import { reorderDivisionSchema } from "./schema";
import { reorderDivision } from "./usecase";

export const reorderDivisionAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  const { organization } = await requireOrganization(slug);

  const parsed = reorderDivisionSchema.safeParse({
    direction: String(formData.get("direction") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderDivision(
      reorderDivisionInDb,
      organization.id,
      tournamentId,
      divisionId,
      parsed.data.direction,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }

  // swapped: false は「端まで来ている」か「その部門が無い」。どちらも
  // 画面上は何も起きなかったのと同じで、エラーにする必要はない。
  // 並べ替えは大会詳細ページに留まる操作なので redirect はしない。
  revalidatePath(`/orgs/${slug}/tournaments/${tournamentId}`);
  return { error: null };
};
