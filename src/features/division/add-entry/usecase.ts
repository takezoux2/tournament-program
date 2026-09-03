import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AddEntryPort } from "./repository";
import type { AddEntryInput } from "./schema";

export const addEntry = (
  port: AddEntryPort,
  ids: DivisionIds,
  input: AddEntryInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
