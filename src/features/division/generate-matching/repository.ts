import "server-only";
import type { Effect } from "effect";
import {
  type DivisionError,
  DivisionEntryLimitError,
  DivisionNotEnoughEntriesError,
} from "../errors";
import { maxEntries, regenerateMatching } from "../matching-strategy";
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
    // 2 人未満だと組み合わせが作れない。黙って空を書くと「生成した」と
    // 読めてしまうので弾く。この判定は両形式で共通。
    if (matchingConfig.matches.length === 0) {
      throw new DivisionNotEnoughEntriesError({ divisionId: ids.divisionId });
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
