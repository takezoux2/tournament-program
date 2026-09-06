import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { ReorderEntryPort, ReorderEntryResult } from "./repository";
import type { ReorderEntryInput } from "./schema";

export const reorderEntry = (
  port: ReorderEntryPort,
  ids: DivisionIds,
  input: ReorderEntryInput,
): Effect.Effect<DivisionSetupOutcome<ReorderEntryResult>, DivisionError> =>
  port(ids, input);
