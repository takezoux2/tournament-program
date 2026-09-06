import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import { applyEntryReordered } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { reorderEntries } from "./domain";
import type { ReorderEntryInput } from "./schema";

/**
 * 並べ替えの結果。組み合わせに何が起きたかを分けて返すのは、
 * 画面の通知が事実とずれないようにするため。remove-entry と同じ理由。
 * - unchanged: トーナメントで触らなかった、または組み合わせが未作成
 * - regenerated: リーグの新しいシード順で作り直した
 * - clearedOverCap: リーグの上限を残りエントリーが超えたままで、
 *   applyEntryReordered が上限超過を理由に空を返した。並べ替えはエントリー数を
 *   変えないので、この状態に来られるのは /edit でトーナメントから切り替わった
 *   直後の、上限を超えたエントリーを残したリーグだけ。
 */
export type ReorderEntryResult =
  | { moved: false }
  | { moved: true; matching: "unchanged" | "regenerated" | "clearedOverCap" };

export type ReorderEntryPort = (
  ids: DivisionIds,
  input: ReorderEntryInput,
) => Effect.Effect<DivisionSetupOutcome<ReorderEntryResult>, DivisionError>;

export const reorderEntryInDb: ReorderEntryPort = (ids, input) =>
  runDivisionSetup<ReorderEntryResult>(ids, async (_tx, current) => {
    const reordered = reorderEntries(
      current.entries.entries,
      input.entryId,
      input.direction,
    );

    // null は「端まで来ている」か「その対象が無い」。どちらも画面上は
    // 何も起きなかったのと同じで、応答を区別させない。
    if (reordered === null) {
      return { next: null, value: { moved: false } };
    }

    const entries: DivisionEntries = { version: 1, entries: reordered };
    const matchingConfig = applyEntryReordered(
      current.format,
      current.matchingConfig,
      entries.entries,
    );

    // applyEntryReordered は作り直さなかったとき current.matchingConfig を
    // そのまま返す（参照が同じ）。コピーや詰め替えをしていないから比較で
    // 判別できる。作り直した結果が空なのは、リーグの上限を残りエントリーが
    // 超えたままだったとき（並べ替え自体はエントリー数を変えない）。
    const matching =
      matchingConfig === current.matchingConfig
        ? "unchanged"
        : matchingConfig.matches.length === 0
          ? "clearedOverCap"
          : "regenerated";

    return {
      next: { format: current.format, entries, matchingConfig },
      value: { moved: true, matching },
    };
  });
