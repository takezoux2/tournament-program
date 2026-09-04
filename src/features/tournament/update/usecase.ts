import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { UpdateTournamentPort } from "./repository";
import type { UpdateTournamentInput } from "./schema";

export const updateTournament = (
  port: UpdateTournamentPort,
  input: UpdateTournamentInput,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({
    organizationId,
    tournamentId,
    name: input.name,
    startsAt: input.startsAt,
    description: input.description,
  });
