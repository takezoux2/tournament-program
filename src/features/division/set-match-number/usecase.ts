import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetMatchNumberPort } from "./repository";
import type { SetMatchNumberInput } from "./schema";

export const setMatchNumberForDivision = (
  port: SetMatchNumberPort,
  ids: DivisionIds,
  input: SetMatchNumberInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
