import type { Effect } from "effect";
import type { DivisionError } from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type {
  SetPlayerNumberCommand,
  SetPlayerNumberPort,
  SetPlayerNumberResult,
} from "./repository";

export const setPlayerNumberForParticipant = (
  port: SetPlayerNumberPort,
  ids: DivisionIds,
  input: SetPlayerNumberCommand,
): Effect.Effect<DivisionSetupOutcome<SetPlayerNumberResult>, DivisionError> =>
  port(ids, input);
