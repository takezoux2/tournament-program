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
 * 並べ替えの結果。組み合わせを作り直したかどうかを分けて返すのは、
 * 画面の通知が事実とずれないようにするため。リーグはシード順から
 * 割り当てが決まるので作り直すが、トーナメントは触らない。
 */
export type ReorderEntryResult = { moved: boolean; regenerated: boolean };

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
      return { next: null, value: { moved: false, regenerated: false } };
    }

    const entries: DivisionEntries = { version: 1, entries: reordered };
    const matchingConfig = applyEntryReordered(
      current.format,
      current.matchingConfig,
      entries.entries,
    );

    return {
      next: { format: current.format, entries, matchingConfig },
      value: {
        moved: true,
        // applyEntryReordered は作り直さなかったとき current.matchingConfig を
        // そのまま返す（参照が同じ）。コピーや詰め替えをしていないから比較で
        // 判別できる。
        regenerated: matchingConfig !== current.matchingConfig,
      },
    };
  });
