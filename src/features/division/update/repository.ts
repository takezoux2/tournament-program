import "server-only";
import { Effect } from "effect";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";

export type UpdateDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  format: DivisionFormat;
}) => Effect.Effect<{ updated: number }, DivisionError>;

export const updateDivisionInDb: UpdateDivisionPort = (input) =>
  Effect.tryPromise({
    try: async () => {
      // updateMany を使うのは where に所有条件を残したまま更新するため。
      // update は unique な where しか受け付けず、id 単独になってしまう。
      const result = await prisma.division.updateMany({
        where: {
          id: input.divisionId,
          tournament: {
            id: input.tournamentId,
            organizationId: input.organizationId,
          },
        },
        // order はここでは触らない。並べ替えは reorder スライスが担当する。
        data: { name: input.name, format: input.format },
      });
      return { updated: result.count };
    },
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
