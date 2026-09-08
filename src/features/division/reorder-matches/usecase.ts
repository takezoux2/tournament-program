import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ReorderMatchesPort } from "./repository";
import type { ReorderMatchesInput } from "./schema";

export const reorderMatchesForDivision = (
  port: ReorderMatchesPort,
  ids: DivisionIds,
  input: ReorderMatchesInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
