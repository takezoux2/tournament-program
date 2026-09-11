import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetMatchNamePort } from "./repository";
import type { SetMatchNameInput } from "./schema";

export const setMatchNameForDivision = (
  port: SetMatchNamePort,
  ids: DivisionIds,
  input: SetMatchNameInput,
): Effect.Effect<DivisionSetupOutcome<null>, DivisionError> => port(ids, input);
