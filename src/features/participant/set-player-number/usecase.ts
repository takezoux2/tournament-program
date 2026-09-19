import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds } from "../scope";
import type {
  SetPlayerNumberCommand,
  SetPlayerNumberPort,
  SetPlayerNumberResult,
} from "./repository";

export const setPlayerNumberForParticipant = (
  port: SetPlayerNumberPort,
  ids: ParticipantIds,
  input: SetPlayerNumberCommand,
): Effect.Effect<SetPlayerNumberResult, ParticipantError> => port(ids, input);
