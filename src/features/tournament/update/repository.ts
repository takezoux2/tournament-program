import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type UpdateTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
  name: string;
  startsAt: Date | null;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const updateTournamentInDb: UpdateTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは where に organizationId を残したまま更新するため。
      // update は unique な where しか受け付けず、id 単独になってしまう。
      const result = await prisma.tournament.updateMany({
        where: { id: input.tournamentId, organizationId: input.organizationId },
        data: { name: input.name, startsAt: input.startsAt },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
