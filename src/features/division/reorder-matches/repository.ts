import "server-only";
import { Effect } from "effect";
import {
  parseDivisionEntries,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { validateMatchingConfig } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchOrderError,
  toDivisionError,
} from "../errors";
import { isEditableFormat } from "../matching-strategy";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import { reorderMatches } from "./domain";
import type { ReorderMatchesInput } from "./schema";

export type ReorderMatchesPort = (
  ids: DivisionIds,
  input: ReorderMatchesInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * 実施順と試合番号だけを書き換える。試合の id も対戦カードも変えないため、
 * results（matchId で試合を指す）と ScheduleItem（(divisionId, matchId) で
 * 指す）の参照は壊れない。だから勝敗記録後でも並べ替えられる。
 * runDivisionSetup は results が 1 件でもあると拒否する読み出しなので、
 * ここでは使わず専用のトランザクションを書く（set-match-number と同じ理由）。
 */
export const reorderMatchesInDb: ReorderMatchesPort = (ids, input) =>
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
        // 編集画面を持たない形式は setup-store と同じく「無い」に倒す。
        if (!row || !isEditableFormat(row.format)) {
          return { found: false };
        }

        const next = reorderMatches(
          parseMatchingConfig(row.matchingConfig),
          input.matchIds,
        );
        // 画面が古い（別の誰かが組み合わせを作り直した）。一部だけ書くと
        // 試合が消えた組み合わせになるので、何も書かずに読み直しを促す。
        if (next === null) {
          throw new DivisionMatchOrderError({ divisionId: ids.divisionId });
        }

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
