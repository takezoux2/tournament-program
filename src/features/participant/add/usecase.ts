import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type { AddParticipantPort, AddParticipantResult } from "./repository";
import type { AddParticipantInput } from "./schema";

export const addParticipant = (
  port: AddParticipantPort,
  ids: ParticipantIds,
  input: AddParticipantInput,
): Effect.Effect<ParticipantOutcome<AddParticipantResult>, ParticipantError> =>
  port(ids, input);
