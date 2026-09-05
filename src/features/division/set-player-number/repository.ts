import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  type DivisionError,
  DivisionParticipantNotFoundError,
  toDivisionError,
} from "../errors";
import type { DivisionIds, DivisionSetupOutcome } from "../setup-store";
import type { SetPlayerNumberInput } from "./schema";

/** confirmed は「重複を承知で確定する」。handler が確認フローから導出する。 */
export type SetPlayerNumberCommand = SetPlayerNumberInput & {
  confirmed: boolean;
};

/** updated: false は「重複が見つかったので確認待ち」。 */
export type SetPlayerNumberResult = { updated: boolean };

export type SetPlayerNumberPort = (
  ids: DivisionIds,
  input: SetPlayerNumberCommand,
) => Effect.Effect<DivisionSetupOutcome<SetPlayerNumberResult>, DivisionError>;

/**
 * 選手番号は Participant（大会単位）の属性で Division の Json ではないため、
 * setup-store は使わず Participant を直接更新する。一意制約は無いので
 * 重複チェックと更新を同一トランザクションに入れて確認フローの根拠にする。
 */
export const setPlayerNumberInDb: SetPlayerNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(
        async (tx): Promise<DivisionSetupOutcome<SetPlayerNumberResult>> => {
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
            throw new DivisionParticipantNotFoundError({
              participantId: input.participantId,
            });
          }

          const duplicate = await tx.participant.findFirst({
            where: {
              tournamentId: ids.tournamentId,
              playerNumber: input.playerNumber,
              id: { not: input.participantId },
            },
            select: { id: true },
          });
          if (duplicate && !input.confirmed) {
            return { found: true, value: { updated: false } };
          }

          await tx.participant.update({
            where: { id: input.participantId },
            data: { playerNumber: input.playerNumber },
          });
          return { found: true, value: { updated: true } };
        },
      ),
    catch: (reason) => toDivisionError(reason, ids.tournamentId),
  });
