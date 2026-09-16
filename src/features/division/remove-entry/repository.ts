import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  maxEntries,
  minEntries,
  regenerateMatching,
} from "../matching-strategy";
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
 * - cleared: 残りが形式の下限（minEntries）を下回り、木が作れず空になった。
 *   下限は形式ごとに違う（トーナメント/リーグは 2 人、ダブルエリミは 3 人）ため、
 *   通知文言に使う minimum を一緒に返す。
 * - clearedOverCap: この形式の上限（maxEntries(current.format)）を残りエントリーが
 *   超えたままで、regenerateMatching が上限超過を理由に空を返した。
 *   /edit で上限の緩い形式（トーナメント 128 人）から上限の厳しい形式
 *   （リーグ 16 人・ダブルエリミ 64 人）へ切り替えた直後の部門でだけ起こりうる
 *   （生成は上限で守られているため、生成経由ではここに来る数のエントリーは作れない）。
 *   cleared と原因が違うので通知の文言も分ける。上限の人数は形式ごとに違うため、
 *   通知文言に使う limit を一緒に返す。
 */
export type RemoveEntryResult =
  | { removed: false }
  | {
      removed: true;
      matching: "unchanged" | "regenerated";
    }
  | { removed: true; matching: "cleared"; minimum: number }
  | { removed: true; matching: "clearedOverCap"; limit: number };

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
    // トーナメントで手動入れ替えした配置と、両形式で手で変えた試合番号は
    // ここで失われるので、画面には再生成した旨を出す。
    const hadMatching = current.matchingConfig.matches.length > 0;
    const matchingConfig = hadMatching
      ? regenerateMatching(current.format, entries.entries)
      : current.matchingConfig;

    // 判定は除去「後」の結果で行う。残りが形式の下限を下回ると組み合わせは
    // 作れず空になるため、除去前だけを見て「再生成しました」と伝えると
    // 画面の文言が事実とずれる。
    // 空になった理由も下限割れか上限超過かで分ける。regenerateMatching は
    // 形式の上限（リーグ・ダブルエリミ）を超えているときも空を返すため、
    // 同じ「空になった」でも原因が違えば運営者への伝え方を変える必要がある。
    const overCap = entries.entries.length > maxEntries(current.format);
    const matching = !hadMatching
      ? "unchanged"
      : matchingConfig.matches.length === 0
        ? overCap
          ? "clearedOverCap"
          : "cleared"
        : "regenerated";

    const value: RemoveEntryResult =
      matching === "cleared"
        ? { removed: true, matching, minimum: minEntries(current.format) }
        : matching === "clearedOverCap"
          ? { removed: true, matching, limit: maxEntries(current.format) }
          : { removed: true, matching };

    return {
      next: { format: current.format, entries, matchingConfig },
      value,
    };
  });
