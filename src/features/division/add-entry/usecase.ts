import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { AddEntryPort, AddEntryResult } from "./repository";
import type { AddEntryInput } from "./schema";

export const addEntry = (
  port: AddEntryPort,
  ids: DivisionIds,
  input: AddEntryInput,
): Effect.Effect<DivisionSetupOutcome<AddEntryResult>, DivisionError> =>
  port(ids, input);
