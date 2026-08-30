import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type DeleteTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ deleted: number }, TournamentError>;

export const deleteTournamentInDb: DeleteTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany と同じ理由で deleteMany を使う。where に organizationId を残す。
      const result = await prisma.tournament.deleteMany({
        where: { id: input.tournamentId, organizationId: input.organizationId },
      });
      return { deleted: result.count };
    },
    catch: toTournamentError,
  });
