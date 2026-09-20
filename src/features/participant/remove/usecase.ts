import type { Effect } from "effect";
import type { ParticipantError } from "../errors";
import type { ParticipantIds } from "../scope";
import type { RemoveParticipantPort } from "./repository";
import type { RemoveParticipantInput } from "./schema";

export const removeParticipant = (
  port: RemoveParticipantPort,
  ids: ParticipantIds,
  input: RemoveParticipantInput,
): Effect.Effect<void, ParticipantError> => port(ids, input);
