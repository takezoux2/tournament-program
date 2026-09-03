import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SwapSlotsPort } from "./repository";
import type { SwapSlotsInput } from "./schema";

export const swapSlotsForDivision = (
  port: SwapSlotsPort,
  ids: DivisionIds,
  input: SwapSlotsInput,
): Effect.Effect<DivisionSetupOutcome<{ swapped: boolean }>, DivisionError> =>
  port(ids, input);
