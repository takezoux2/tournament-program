import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { GenerateMatchingPort } from "./repository";

export const generateMatching = (
  port: GenerateMatchingPort,
  ids: DivisionIds,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids);
