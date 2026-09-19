"use server";

import { Exit } from "effect";
import { notFound } from "next/navigation";
import { runOperationExit } from "@/shared/lib/logger/run-operation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { addEntryInDb } from "./repository";
import { addEntrySchema } from "./schema";
import { addEntry } from "./usecase";

export const addEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  // mode に応じて要る項目が変わるので、両方の項目をそのまま渡して
  // discriminatedUnion に選ばせる。
  const parsed = addEntrySchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    name: String(formData.get("name") ?? ""),
    nameKana: String(formData.get("nameKana") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await runOperationExit(
    "division.add-entry",
    {
      request: parsed.data,
      context: {
        organizationId: organization.id,
        tournamentId,
        divisionId,
      },
    },
    addEntry(
      addEntryInDb,
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

  revalidateDivisionSetup(slug, tournamentId, divisionId);

  // リーグは 1 人増えるだけで全員の試合と matchName が丸ごと作り直る。
  // 手で振った試合名が消えるのは驚きになりうるので、起きたことを明示する。
  // remove-entry/handler.ts と同じ言い回しにする。
  return exit.value.value.regenerated
    ? { error: null, notice: "エントリーを追加し、組み合わせを再生成しました" }
    : { error: null, notice: "エントリーを追加しました" };
};
