"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { type RemoveEntryResult, removeEntryInDb } from "./repository";
import { removeEntrySchema } from "./schema";
import { removeEntry } from "./usecase";

/**
 * 削除できたときだけ出す文言。組み合わせに何が起きたかで言い分ける。
 * Record にしておくと matching に候補が増えたときコンパイルが止まる。
 */
const REMOVED_NOTICE: Record<
  Extract<RemoveEntryResult, { removed: true }>["matching"],
  string
> = {
  unchanged: "エントリーを削除しました",
  regenerated: "エントリーを削除し、組み合わせを再生成しました",
  cleared:
    "エントリーを削除し、残りが 2 人未満になったため組み合わせを取り消しました",
};

export const removeEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = removeEntrySchema.safeParse({
    entryId: String(formData.get("entryId") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    removeEntry(
      removeEntryInDb,
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

  // 対象が無かったときは何も消えていない。存在を漏らさないためエラーにはしないが、
  // 通知も出さない。出すと消えていない行を消えたものと読ませてしまう。
  const result = exit.value.value;
  if (!result.removed) {
    return { error: null };
  }

  // 手動で入れ替えた配置が消えるのは驚きになりうるので、起きたことを明示する。
  return { error: null, notice: REMOVED_NOTICE[result.matching] };
};
