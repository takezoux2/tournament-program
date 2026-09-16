import "server-only";
import type { Effect } from "effect";
import {
  DivisionEntryLimitError,
  type DivisionError,
  DivisionNotEnoughEntriesError,
} from "../errors";
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

export type GenerateMatchingPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const generateMatchingInDb: GenerateMatchingPort = (ids) =>
  runDivisionSetup(ids, async (_tx, current) => {
    // add-entry は上限を守るが、/edit は format をいつでも書き換えられる。
    // 128 人のトーナメントを ROUND_ROBIN に切り替えてここを押すと、
    // add-entry を経由せずに上限超過のエントリー数で組み合わせを
    // 作れてしまうため、生成の直前にもう一度確かめる。
    const limit = maxEntries(current.format);
    if (current.entries.entries.length > limit) {
      throw new DivisionEntryLimitError({ divisionId: ids.divisionId, limit });
    }

    const matchingConfig = regenerateMatching(
      current.format,
      current.entries.entries,
    );
    // 必要人数に満たないと組み合わせが作れない（builder が空を返す）。
    // 黙って空を書くと「生成した」と読めてしまうので弾く。
    if (matchingConfig.matches.length === 0) {
      throw new DivisionNotEnoughEntriesError({
        divisionId: ids.divisionId,
        minimum: minEntries(current.format),
      });
    }

    return {
      next: {
        format: current.format,
        entries: current.entries,
        matchingConfig,
      },
      value: null,
    };
  });
