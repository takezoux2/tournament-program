import "server-only";
import { Effect } from "effect";
import { DivisionJsonError, parseDivisionEntries } from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";
import {
  ParticipantDataError,
  ParticipantEnteredError,
  type ParticipantError,
  ParticipantNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds } from "../scope";
import type { RemoveParticipantInput } from "./schema";

export type RemoveParticipantPort = (
  ids: ParticipantIds,
  input: RemoveParticipantInput,
) => Effect.Effect<void, ParticipantError>;

/**
 * 参加者を大会から外す。Member は消さない。Member は組織のマスタで、
 * 大会から外れただけの人を組織から消すのは別の操作（/orgs/[slug]/members）。
 *
 * エントリーの有無の判定と削除を同一トランザクションに入れるのは、
 * 一覧を描いてから送信するまでの間に別の運営者がエントリーを足しうるため。
 * 一覧側でもボタンを無効にするが、拒否の境界はここにある。
 */
export const removeParticipantInDb: RemoveParticipantPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<void> => {
        const participant = await tx.participant.findFirst({
          where: {
            id: input.participantId,
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          select: { id: true },
        });
        if (!participant) {
          throw new ParticipantNotFoundError({
            participantId: input.participantId,
          });
        }

        const divisions = await tx.division.findMany({
          where: {
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          orderBy: { order: "asc" },
          select: { id: true, name: true, entries: true },
        });

        const entered: string[] = [];
        for (const division of divisions) {
          let parsed: ReturnType<typeof parseDivisionEntries>;
          try {
            parsed = parseDivisionEntries(division.entries);
          } catch (reason) {
            // 一覧（repository.ts）と違い、ここでは読み飛ばさない。
            // 読み飛ばすと壊れた部門にエントリー済みの参加者を消せてしまい、
            // この検査そのものが素通りする。
            if (reason instanceof DivisionJsonError) {
              throw new ParticipantDataError({ divisionId: division.id });
            }
            throw reason;
          }

          if (
            parsed.entries.some(
              (entry) => entry.participantId === input.participantId,
            )
          ) {
            entered.push(division.name);
          }
        }

        if (entered.length > 0) {
          throw new ParticipantEnteredError({ divisionNames: entered });
        }

        await tx.participant.delete({ where: { id: input.participantId } });
      }),
    catch: (reason) => toParticipantError(reason),
  });
