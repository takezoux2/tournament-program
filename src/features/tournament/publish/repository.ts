import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type TournamentError, toTournamentError } from "../errors";

export type PublishTournamentPort = (input: {
  organizationId: string;
  tournamentId: string;
}) => Effect.Effect<{ updated: number }, TournamentError>;

export const publishTournamentInDb: PublishTournamentPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // 遷移前の status を where に入れておくと、二重送信や古い画面からの
      // 操作は 0 件更新になり、状態を飛び越えた遷移が起きない。
      const result = await prisma.tournament.updateMany({
        where: {
          id: input.tournamentId,
          organizationId: input.organizationId,
          status: "DRAFT",
        },
        data: { status: "IN_PROGRESS" },
      });
      return { updated: result.count };
    },
    catch: toTournamentError,
  });
