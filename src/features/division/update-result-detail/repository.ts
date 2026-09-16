import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionResultConfig,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { resolveMatchSlots } from "@/lib/division/resolve";
import { applyMatchResult } from "@/lib/division/results";
import type { DivisionResults } from "@/lib/division/types";
import { validateResults } from "@/lib/division/validate";
import { prisma } from "@/shared/db/prisma";
import {
  DivisionDataError,
  type DivisionError,
  DivisionMatchNotFoundError,
  DivisionResultNotRecordedError,
  DivisionRevisionConflictError,
  DivisionWinReasonNotAllowedError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import { buildDetailRecord, isAcceptableWinReason } from "./detail";
import type { UpdateResultDetailInput } from "./schema";

export type UpdateResultDetailPort = (
  ids: DivisionIds,
  input: UpdateResultDetailInput,
) => Effect.Effect<DivisionSetupOutcome<void>, DivisionError>;

const toJsonInput = (results: DivisionResults): Prisma.InputJsonValue =>
  results as unknown as Prisma.InputJsonValue;

/**
 * 1 試合の詳細（勝因・スコア・メモ）を書く。勝敗には触らない。
 *
 * record-result と分けているのは、あちらが「勝者が変わったら下流の記録を消す」
 * という条件を持つため。詳細の保存は勝者を変えないので、下流を消してはならない。
 * 同じ入口に同居させると「何を送ったときに何が消えるか」が読めなくなる。
 */
export const updateResultDetailInDb: UpdateResultDetailPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<DivisionSetupOutcome<void>> => {
        const ownership = {
          id: ids.divisionId,
          tournament: {
            id: ids.tournamentId,
            organizationId: ids.organizationId,
          },
        };

        const row = await tx.division.findFirst({
          where: ownership,
          select: {
            format: true,
            matchingConfig: true,
            results: true,
            resultConfig: true,
            revision: true,
          },
        });
        if (!row) {
          return { found: false };
        }

        const config = parseMatchingConfig(row.matchingConfig);
        const current = parseDivisionResults(row.results);
        const resultConfig = parseDivisionResultConfig(row.resultConfig);

        if (!config.matches.some((match) => match.id === input.matchId)) {
          throw new DivisionMatchNotFoundError({ matchId: input.matchId });
        }

        // 勝敗より先に詳細だけを入れる場面は無い。許すと「記録の無い試合が
        // 記録済みに見える」状態を作ってしまう。
        const existing = current.matches.find(
          (record) => record.matchId === input.matchId,
        );
        if (existing === undefined) {
          throw new DivisionResultNotRecordedError({
            matchId: input.matchId,
          });
        }

        if (
          resultConfig.winReason.enabled &&
          !isAcceptableWinReason(input.winReason.trim(), resultConfig, existing)
        ) {
          throw new DivisionWinReasonNotAllowedError({
            winReason: input.winReason,
          });
        }

        // 画面ではその試合に立っている 2 人ぶんしか欄を出さないが、Server Action は
        // ページを経由せず直接叩けるので、ここで独立に確かめる。
        const resolved = resolveMatchSlots(config, current).get(input.matchId);
        const standingEntryIds =
          resolved === undefined
            ? []
            : resolved.slots.flatMap((slot) =>
                slot.state === "entry" ? [slot.entryId] : [],
              );

        const next = applyMatchResult(
          current,
          buildDetailRecord(existing, input, resultConfig, standingEntryIds),
        );

        // record-result の save と同じく、書く直前に反映後の全体を検証する。
        const errors = validateResults(next, config, row.format);
        if (errors.length > 0) {
          throw new DivisionDataError({ reason: errors });
        }

        const updated = await tx.division.updateMany({
          where: { ...ownership, revision: row.revision },
          data: { results: toJsonInput(next), revision: row.revision + 1 },
        });
        if (updated.count === 0) {
          throw new DivisionRevisionConflictError({
            divisionId: ids.divisionId,
          });
        }

        return { found: true, value: undefined };
      }),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
