import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { DeleteTournamentPort } from "./repository";

export const deleteTournament = (
  port: DeleteTournamentPort,
  organizationId: string,
  tournamentId: string,
): Effect.Effect<{ deleted: number }, TournamentError> =>
  port({ organizationId, tournamentId });
