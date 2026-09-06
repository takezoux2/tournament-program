import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionNotEnoughEntriesError } from "../errors";
import { regenerateMatching } from "../matching-strategy";
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
