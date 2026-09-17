import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { UpdateResultDetailPort } from "./repository";
import type { UpdateResultDetailInput } from "./schema";

export const updateResultDetailForDivision = (
  port: UpdateResultDetailPort,
  ids: DivisionIds,
  input: UpdateResultDetailInput,
): Effect.Effect<DivisionSetupOutcome<void>, DivisionError> => port(ids, input);
