import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AssignSlotPort } from "./repository";
import type { AssignSlotInput } from "./schema";

export const assignSlotInDivision = (
  port: AssignSlotPort,
  ids: DivisionIds,
  input: AssignSlotInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
