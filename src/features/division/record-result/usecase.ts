import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RecordResultPort } from "./repository";
import type { RecordResultInput } from "./schema";

export const recordResultForDivision = (
  port: RecordResultPort,
  ids: DivisionIds,
  input: RecordResultInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
