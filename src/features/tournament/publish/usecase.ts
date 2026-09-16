import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { PublishTournamentPort } from "./repository";

export const publishTournament = (
  port: PublishTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({ organizationId, tournamentId });
