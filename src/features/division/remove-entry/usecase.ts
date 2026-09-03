import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { RemoveEntryPort, RemoveEntryResult } from "./repository";
import type { RemoveEntryInput } from "./schema";

export const removeEntry = (
  port: RemoveEntryPort,
  ids: DivisionIds,
  input: RemoveEntryInput,
): Effect.Effect<DivisionSetupOutcome<RemoveEntryResult>, DivisionError> =>
  port(ids, input);
