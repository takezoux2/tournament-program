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
 * "cleared" と "clearedOverCap" は形式ごとの人数（minimum / limit）を
 * 文中に差し込む必要があるため、ここでは扱わず removeEntryAction 側で
 * 個別に組み立てる。
 */
const REMOVED_NOTICE: Record<
  Exclude<
    Extract<RemoveEntryResult, { removed: true }>["matching"],
    "cleared" | "clearedOverCap"
  >,
  string
> = {
  unchanged: "エントリーを削除しました",
  regenerated: "エントリーを削除し、組み合わせを再生成しました",
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
  // "cleared" は形式ごとに下限が違う（トーナメント/リーグは 2 人、
  // ダブルエリミは 3 人）ため、固定文言ではなく result.minimum を差し込む。
  // "clearedOverCap" も同様に形式ごとに上限が違う（リーグ 16 人・ダブルエリミ
  // 64 人）ため、result.limit を差し込む。リーグ専用の文言にすると、
  // /edit で切り替わった直後のダブルエリミの部門で事実と違う案内になる。
  const notice =
    result.matching === "cleared"
      ? `エントリーを削除し、残りが${result.minimum}人未満になったため組み合わせを取り消しました`
      : result.matching === "clearedOverCap"
        ? `エントリーを削除しましたが、形式の上限（${result.limit}人）を超えているため組み合わせを取り消しました。上限以下になるまで削除してから生成し直してください`
        : REMOVED_NOTICE[result.matching];

  return { error: null, notice };
};
