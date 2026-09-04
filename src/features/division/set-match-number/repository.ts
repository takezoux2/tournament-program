import "server-only";
import { Effect } from "effect";
import {
  parseDivisionEntries,
  parseMatchingConfig,
} from "@/lib/division/parse";
import type { MatchingConfig } from "@/lib/division/types";
import { validateMatchingConfig } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionMatchNumberConflictError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetMatchNumberInput } from "./schema";

export type SetMatchNumberPort = (
  ids: DivisionIds,
  input: SetMatchNumberInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 試合番号だけを書き換える。組み合わせの構造も勝敗の参照も変えないため、
 * 勝敗記録後でも編集できる。runDivisionSetup は results が 1 件でもあると
 * 拒否する読み出しなので、ここでは使わず専用のトランザクションを書く。
 */
export const setMatchNumberInDb: SetMatchNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<null>> => {
        const row = await tx.division.findFirst({
          where: {
            id: ids.divisionId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          select: { format: true, entries: true, matchingConfig: true },
        });
        // 対象外の形式は setup-store と同じく「無い」に倒す。
        if (!row || row.format !== "SINGLE_ELIMINATION") {
          return { found: false };
        }

        const config = parseMatchingConfig(row.matchingConfig);
        const target = config.matches.find(
          (match) => match.id === input.matchId,
        );
        if (!target) {
          throw new DivisionMatchNotFoundError({ matchId: input.matchId });
        }
        if (
          config.matches.some(
            (match) =>
              match.id !== input.matchId &&
              match.matchNumber === input.matchNumber,
          )
        ) {
          throw new DivisionMatchNumberConflictError({
            matchNumber: input.matchNumber,
          });
        }

        const next: MatchingConfig = {
          version: 1,
          matches: config.matches.map((match) =>
            match.id === input.matchId
              ? { ...match, matchNumber: input.matchNumber }
              : match,
          ),
        };

        // setup-store の save と同じく、書く直前に検証を通す。
        const errors = validateMatchingConfig(
          next,
          parseDivisionEntries(row.entries),
        );
        if (errors.length > 0) {
          throw new DivisionDataError({ reason: errors });
        }

        await tx.division.updateMany({
          where: {
            id: ids.divisionId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          data: { matchingConfig: next },
        });
        return { found: true, value: null };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
