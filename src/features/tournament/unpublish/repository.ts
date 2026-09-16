import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type UnpublishTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const unpublishTournamentInDb: UnpublishTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 遷移前の status を where に入れ、すでに DRAFT なら 0 件更新にする。
      const result = await prisma.tournament.updateMany({
        where: {
          id: input.tournamentId,
          organizationId: input.organizationId,
          status: { not: "DRAFT" },
        },
        data: { status: "DRAFT" },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
