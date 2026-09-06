"use server";

import { Effect, Exit } from "effect";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/shared/middleware/require-organization";
import { divisionErrorFormState } from "../effect-to-form-state";
import { revalidateDivisionSetup } from "../revalidate";
import type { DivisionFormState } from "../state";
import { type ReorderEntryResult, reorderEntryInDb } from "./repository";
import { reorderEntrySchema } from "./schema";
import { reorderEntry } from "./usecase";

/**
 * 並べ替えたときだけ出す文言。組み合わせに何が起きたかで言い分ける。
 * remove-entry と同じ理由。unchanged は通知するようなことが起きていない
 * （トーナメントは触らない、もしくは組み合わせが未作成）ので null にする。
 */
const REORDERED_NOTICE: Record<
  Extract<ReorderEntryResult, { moved: true }>["matching"],
  string | null
> = {
  unchanged: null,
  regenerated: "並べ替えに合わせて対戦表を作り直しました",
  // 並べ替え自体はエントリー数を変えないため、ここに来るのはリーグの上限を
  // 残りエントリーが超えたままだったときだけ。「作り直しました」と言うと
  // 対戦表が存在するかのように読めてしまうので、取り消した旨を伝える。
  clearedOverCap:
    "並べ替えは反映しましたが、リーグの上限を超えたままのため組み合わせは取り消したままです",
};

export const reorderEntryAction = async (
  _prevState: DivisionFormState,
  formData: FormData,
): Promise<DivisionFormState> => {
  const slug = String(formData.get("slug") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const divisionId = String(formData.get("divisionId") ?? "");
  // Server Action はページを経由せず直接叩ける別の入口なので、ここで独立に確かめる。
  const { organization } = await requireOrganization(slug);

  const parsed = reorderEntrySchema.safeParse({
    entryId: String(formData.get("entryId") ?? ""),
    direction: String(formData.get("direction") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const exit = await Effect.runPromiseExit(
    reorderEntry(
      reorderEntryInDb,
      { organizationId: organization.id, tournamentId, divisionId },
      parsed.data,
    ),
  );

  if (Exit.isFailure(exit)) {
    return divisionErrorFormState(exit.cause);
  }
  if (!exit.value.found) {
    notFound();
  }

  // moved: false は「端まで来ている」。エラーにする必要はない。
  revalidateDivisionSetup(slug, tournamentId, divisionId);

  // 対象が無かった／端まで来ていたときは何も起きていない。通知は出さない。
  if (!exit.value.value.moved) {
    return { error: null };
  }

  // 手で変えた試合番号が消える、または組み合わせが取り消されるのは
  // 驚きになりうるので、起きたことを明示する。
  const notice = REORDERED_NOTICE[exit.value.value.matching];
  return notice === null ? { error: null } : { error: null, notice };
};
