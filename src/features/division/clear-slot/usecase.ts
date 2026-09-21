import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { SlotTarget } from "../first-round-schema";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ClearSlotPort } from "./repository";

export const clearSlotInDivision = (
  port: ClearSlotPort,
  ids: DivisionIds,
  input: SlotTarget,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
