import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionNotEnoughEntriesError } from "../errors";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  runDivisionSetup,
} from "../setup-store";
import { buildFromSlots } from "../single-elimination/build";
import { generateSlots } from "../single-elimination/edit";

export type GenerateMatchingPort = (
  ids: DivisionIds,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const generateMatchingInDb: GenerateMatchingPort = (ids) =>
  runDivisionSetup(ids, async (_tx, current) => {
    const slots = generateSlots(current.entries.entries);
    // 2 人未満だと木が作れない。黙って空を書くと「生成した」と読めてしまうので弾く。
    if (slots.length === 0) {
      throw new DivisionNotEnoughEntriesError({ divisionId: ids.divisionId });
    }

    return {
      next: {
        entries: current.entries,
        matchingConfig: buildFromSlots(slots),
      },
      value: null,
    };
  });
