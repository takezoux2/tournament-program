"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { generateMatchingInDb } from "./repository";
import { generateMatching } from "./usecase";

export const generateMatchingAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const exit = await runOperationExit(
    "division.generate-matching",
    {
      context: {
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    generateMatching(generateMatchingInDb, {
      organizationId: organization.id,
      tournamentId,
      divisionId,
    }),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  // 見つからないことと権限が無いことを区別させないため 404 に倒す。
  if (!exit.value.found) {
    notFound();
  }

  // 生成は setup ページに留まる操作なので redirect はしない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);
  return { error: null, notice: "組み合わせを作成しました" };
};
