import "server-only";
import { Effect } from "effect";
import type { Prisma } from "@/generated/prisma/client";
import { nextPlayerNumber } from "@/lib/participant/player-number";
import { prisma } from "@/shared/db/prisma";
import {
  ParticipantDuplicateError,
  type ParticipantError,
  ParticipantMemberNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds, ParticipantOutcome } from "../scope";
import type { AddParticipantInput } from "./schema";

type Tx = Prisma.TransactionClient;

export type AddParticipantResult = { participantId: string };

export type AddParticipantPort = (
  ids: ParticipantIds,
  input: AddParticipantInput,
) => Effect.Effect<ParticipantOutcome<AddParticipantResult>, ParticipantError>;

/**
 * Member を決める。既存を選んだ場合は組織を where に入れて確かめる。
 * 取ってから所属を検証する形にすると、検証の書き忘れがそのまま穴になる。
 */
const resolveMemberId = async (
  tx: Tx,
  organizationId: string,
  input: AddParticipantInput,
): Promise<string> => {
  if (input.mode === "new") {
    const created = await tx.member.create({
      data: {
        organizationId,
        name: input.name,
        nameKana: input.nameKana,
      },
      select: { id: true },
    });
    return created.id;
  }

  const member = await tx.member.findFirst({
    where: { id: input.memberId, organizationId },
    select: { id: true },
  });
  if (!member) {
    throw new ParticipantMemberNotFoundError({ memberId: input.memberId });
  }
  return member.id;
};

/**
 * 大会に参加者を足す。部門の entries には触れないので、足した人は
 * 「どの部門にも居ない」状態で始まる。
 *
 * 大会の所有権を最初に確かめるのは、participant.create が
 * tournamentId を直接持つため。ここで確かめないと、他組織の大会 ID を
 * 送るだけで参加者を作れてしまう。
 */
export const addParticipantInDb: AddParticipantPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<ParticipantOutcome<AddParticipantResult>> => {
          const tournament = await tx.tournament.findFirst({
            where: { id: ids.tournamentId, organizationId: ids.organizationId },
            select: { id: true },
          });
          if (!tournament) {
            return { found: false };
          }

          const memberId = await resolveMemberId(tx, ids.organizationId, input);

          const existing = await tx.participant.findFirst({
            where: { tournamentId: ids.tournamentId, memberId },
            select: { id: true },
          });
          if (existing) {
            throw new ParticipantDuplicateError({ memberId });
          }

          const rows = await tx.participant.findMany({
            where: { tournamentId: ids.tournamentId },
            select: { playerNumber: true },
          });

          // seed は付けない。@@unique([tournamentId, seed]) と衝突するため
          // （Postgres は NULL の重複を許すので null なら安全）。
          const created = await tx.participant.create({
            data: {
              tournamentId: ids.tournamentId,
              memberId,
              playerNumber: nextPlayerNumber(
                rows.map((row) => row.playerNumber),
              ),
            },
            select: { id: true },
          });

          return { found: true, value: { participantId: created.id } };
        },
      ),
    catch: (reason) => toParticipantError(reason),
  });
