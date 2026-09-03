import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";
import type { RemoveEntryInput } from "./schema";

/**
 * 削除の結果。画面の通知が事実とずれないよう、削除できたかどうかと
 * 組み合わせに何が起きたかを分けて返す。
 * - unchanged: 組み合わせが未作成なので触っていない
 * - regenerated: 残りのシード順から作り直した
 * - cleared: 残りが 2 人未満になり、木が作れず空になった
 */
export type RemoveEntryResult =
  | { removed: false }
  | { removed: true; matching: "unchanged" | "regenerated" | "cleared" };

export type RemoveEntryPort = (
  ids: DivisionIds,
  input: RemoveEntryInput,
) => Effect.Effect<DivisionSetupOutcome<RemoveEntryResult>, DivisionError>;

export const removeEntryInDb: RemoveEntryPort = (ids, input) =>
  runDivisionSetup<RemoveEntryResult>(ids, async (_tx, current) => {
    const remaining = current.entries.entries.filter(
      (entry) => entry.id !== input.entryId,
    );

    // 減っていなければ対象が無かったということ。存在を漏らさないため
    // エラーにせず、何も起きなかったものとして返す。
    if (remaining.length === current.entries.entries.length) {
      return { next: null, value: { removed: false } };
    }

    const entries: DivisionEntries = {
      version: 1,
      entries: [...remaining]
        .sort((left, right) => left.seed - right.seed)
        .map((entry, index) => ({ ...entry, seed: index })),
    };

    // 穴を bye として残すより、シード順から作り直した方が結果が読みやすい。
    // 手動で入れ替えた配置はここで失われるので、画面には再生成した旨を出す。
    const hadMatching = current.matchingConfig.matches.length > 0;
    const matchingConfig = hadMatching
      ? buildFromSlots(generateSlots(entries.entries))
      : current.matchingConfig;

    // 判定は除去「後」の結果で行う。残りが 2 人未満だと木は作れず空になるため、
    // 除去前だけを見て「再生成しました」と伝えると画面の文言が事実とずれる。
    const matching = !hadMatching
      ? "unchanged"
      : matchingConfig.matches.length === 0
        ? "cleared"
        : "regenerated";

    return {
      next: { entries, matchingConfig },
      value: { removed: true, matching },
    };
  });
