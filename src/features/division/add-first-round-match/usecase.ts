import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AddFirstRoundMatchPort } from "./repository";

export const addFirstRoundMatchToDivision = (
  port: AddFirstRoundMatchPort,
  ids: DivisionIds,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids);
