import "server-only";
import type { Effect } from "effect";
import { type DivisionError, DivisionMatchNotFoundError } from "../errors";
import type { SlotTarget } from "../first-round-schema";
import { runFirstRoundEdit } from "../first-round-store";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import {
  removeEntries,
  setFirstRoundSlot,
} from "../single-elimination/first-round";

export type ClearSlotPort = (
  ids: DivisionIds,
  input: SlotTarget,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

export const clearSlotInDb: ClearSlotPort = (ids, input) =>
  runFirstRoundEdit<null>(ids, async (_tx, current) => {
    const cleared = setFirstRoundSlot(
      current.matchingConfig,
      input.matchId,
      input.slotIndex,
      { kind: "bye" },
    );
    if (cleared === null) {
      throw new DivisionMatchNotFoundError({ matchId: input.matchId });
    }
    // 既に空なら何も変わらない。書き込みを省く。
    if (cleared.replaced.kind !== "entry") {
      return { next: null, value: null };
    }
    return {
      next: {
        format: current.format,
        entries: removeEntries(current.entries, [cleared.replaced.entryId]),
        matchingConfig: cleared.config,
      },
      value: null,
    };
  });
