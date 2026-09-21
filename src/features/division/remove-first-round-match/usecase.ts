import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RemoveFirstRoundMatchPort } from "./repository";
import type { RemoveFirstRoundMatchInput } from "./schema";

export const removeFirstRoundMatchFromDivision = (
  port: RemoveFirstRoundMatchPort,
  ids: DivisionIds,
  input: RemoveFirstRoundMatchInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
