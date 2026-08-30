import type { Effect } from "effect";
import type { TournamentError } from "../errors";
import type { CreateTournamentPort } from "./repository";
import type { CreateTournamentInput } from "./schema";

export const createTournament = (
  port: CreateTournamentPort,
  input: CreateTournamentInput,
  organizationId: string,
): Effect.Effect<{ id: string }, TournamentError> =>
  port({ ...input, organizationId });
