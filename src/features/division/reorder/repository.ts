import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import { type DivisionError, toDivisionError } from "../errors";
import { findSwapPair, type ReorderDirection } from "./domain";

/** 退避先。order は 0 始まりで採番するため、負数は通常の行と衝突しない。 */
const PARKING_ORDER = -1;

/** swapped: false は「端まで来ている」または「その大会にその部門が無い」。 */
export type ReorderDivisionPort = (input: {
  organizationId: string;
  tournamentId: string;
  divisionId: string;
  direction: ReorderDirection;
}) => Effect.Effect<{ swapped: boolean }, DivisionError>;

export const reorderDivisionInDb: ReorderDivisionPort = (input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx) => {
        // 一覧の取得も所有条件つきで行う。ここを素通しにすると、
        // 他組織の部門を相手に選んでしまう。
        const divisions = await tx.division.findMany({
          where: {
            tournament: {
              id: input.tournamentId,
              organizationId: input.organizationId,
            },
          },
          select: { id: true, order: true },
        });

        const pair = findSwapPair(divisions, input.divisionId, input.direction);
        if (!pair) {
          return { swapped: false };
        }

        // @@unique([tournamentId, order]) があるため直接は交換できない。
        // 片方を退避値へ逃がしてから 2 段で入れ替える。
        await tx.division.updateMany({
          where: { id: pair.target.id, tournamentId: input.tournamentId },
          data: { order: PARKING_ORDER },
        });
        await tx.division.updateMany({
          where: { id: pair.neighbor.id, tournamentId: input.tournamentId },
          data: { order: pair.target.order },
        });
        await tx.division.updateMany({
          where: { id: pair.target.id, tournamentId: input.tournamentId },
          data: { order: pair.neighbor.order },
        });

        return { swapped: true };
      }),
    catch: (reason) => toDivisionError(reason, input.tournamentId),
  });
