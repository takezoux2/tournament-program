import "server-only";
import { Effect } from "effect";
import { prisma } from "@/shared/db/prisma";
import {
  type ParticipantError,
  ParticipantNotFoundError,
  toParticipantError,
} from "../errors";
import type { ParticipantIds } from "../scope";
import type { SetPlayerNumberInput } from "./schema";

/** confirmed は「重複を承知で確定する」。handler が確認フローから導出する。 */
export type SetPlayerNumberCommand = SetPlayerNumberInput & {
  confirmed: boolean;
};

/**
 * updated: false は「重複が見つかったので確認待ち」で、この場合は再検証の
 * 対象を決められない（決めなくてよい）ので divisionIds を持たない。
 * updated: true のときは、更新が確定した大会に属する全部門の id を返す。
 */
export type SetPlayerNumberResult =
  | { updated: false }
  | { updated: true; divisionIds: string[] };

export type SetPlayerNumberPort = (
  ids: ParticipantIds,
  input: SetPlayerNumberCommand,
) => Effect.Effect<SetPlayerNumberResult, ParticipantError>;

/**
 * 一意制約は無いので、重複チェックと更新を同一トランザクションに入れて
 * 確認フローの根拠にする。
 *
 * 移設元は結果を DivisionSetupOutcome で包んでいたが、この repository は
 * 対象が無ければ ParticipantNotFoundError を投げるので found: false を
 * 返す経路が無い。包みを外し、結果をそのまま返す。
 */
export const setPlayerNumberInDb: SetPlayerNumberPort = (ids, input) =>
  Effect.tryPromise({
    try: () =>
      prisma.$transaction(async (tx): Promise<SetPlayerNumberResult> => {
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

        const duplicate = await tx.participant.findFirst({
          where: {
            tournamentId: ids.tournamentId,
            playerNumber: input.playerNumber,
            id: { not: input.participantId },
          },
          select: { id: true },
        });
        if (duplicate && !input.confirmed) {
          return { updated: false };
        }

        await tx.participant.update({
          where: { id: input.participantId },
          data: { playerNumber: input.playerNumber },
        });

        // 選手番号は大会内で共通なので、更新後は大会に属する全部門を
        // 再検証の対象として呼び出し元へ返す。
        const divisions = await tx.division.findMany({
          where: {
            tournament: {
              id: ids.tournamentId,
              organizationId: ids.organizationId,
            },
          },
          select: { id: true },
        });
        return { updated: true, divisionIds: divisions.map((d) => d.id) };
      }),
    catch: (reason) => toParticipantError(reason),
  });
