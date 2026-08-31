import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type DeleteDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
}) => Effect.Effect<{ deleted: number }, DivisionError>;

export const deleteDivisionInDb: DeleteDivisionPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany と同じ理由で deleteMany を使う。where に所有条件を残す。
      const result = await prisma.division.deleteMany({
        where: {
          id: input.divisionId,
          tournament: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
        },
      });
      return { deleted: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
