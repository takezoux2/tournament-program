import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import { maxEntries, regenerateMatching } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import type { RemoveEntryInput } from "./schema";

/**
 * 削除の結果。画面の通知が事実とずれないよう、削除できたかどうかと
 * 組み合わせに何が起きたかを分けて返す。
 * - unchanged: 組み合わせが未作成なので触っていない
 * - regenerated: 残りのシード順から作り直した
 * - cleared: 残りが 2 人未満になり、木が作れず空になった
 * - clearedOverCap: リーグの上限（maxEntries("ROUND_ROBIN")）を残りエントリーが
 *   超えたままで、regenerateMatching が上限超過を理由に空を返した。
 *   /edit でトーナメントからリーグへ切り替えた直後の部門でだけ起こりうる
 *   （生成は上限で守られているため、生成経由ではここに来る数のエントリーは作れない）。
 *   cleared と原因が違うので通知の文言も分ける。
 */
export type RemoveEntryResult =
  | { removed: false }
  | {
      removed: true;
      matching: "unchanged" | "regenerated" | "cleared" | "clearedOverCap";
    };

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

    // 穴を残すより、シード順から作り直した方が結果が読みやすい。
    // トーナメントで手動入れ替えした配置と、両形式で手で変えた試合名は
    // ここで失われるので、画面には再生成した旨を出す。
    const hadMatching = current.matchingConfig.matches.length > 0;
    const matchingConfig = hadMatching
      ? regenerateMatching(current.format, entries.entries)
      : current.matchingConfig;

    // 判定は除去「後」の結果で行う。残りが 2 人未満だと組み合わせは作れず
    // 空になるため、除去前だけを見て「再生成しました」と伝えると
    // 画面の文言が事実とずれる。
    // 空になった理由も 2 人未満か上限超過かで分ける。regenerateMatching は
    // リーグで上限を超えているときも空を返すため、同じ「空になった」でも
    // 原因が違えば運営者への伝え方を変える必要がある。
    const overCap = entries.entries.length > maxEntries(current.format);
    const matching = !hadMatching
      ? "unchanged"
      : matchingConfig.matches.length === 0
        ? overCap
          ? "clearedOverCap"
          : "cleared"
        : "regenerated";

    return {
      next: { format: current.format, entries, matchingConfig },
      value: { removed: true, matching },
    };
  });
