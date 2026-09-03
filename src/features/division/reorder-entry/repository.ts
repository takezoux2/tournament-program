import "server-only";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import type { DivisionError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { reorderEntries } from "./domain";
import type { ReorderEntryInput } from "./schema";

export type ReorderEntryPort = (
  ids: DivisionIds,
  input: ReorderEntryInput,
) => Effect.Effect<DivisionSetupOutcome<{ moved: boolean }>, DivisionError>;

export const reorderEntryInDb: ReorderEntryPort = (ids, input) =>
  runDivisionSetup<{ moved: boolean }>(ids, async (_tx, current) => {
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

    return {
      // 組み合わせは触らない。シード順の変更を反映したければ「生成」を押す。
      next: { entries, matchingConfig: current.matchingConfig },
      value: { moved: true },
    };
  });
