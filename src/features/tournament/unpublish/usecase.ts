import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { UnpublishTournamentPort } from "./repository";

export const unpublishTournament = (
  port: UnpublishTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ updated: number }, TournamentError> =>
  port({ organizationId, tournamentId });
