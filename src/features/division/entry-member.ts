import "server-only";
import { nextPlayerNumber } from "@/lib/participant/player-number";
import type { AddEntryInput } from "./add-entry/schema";
import { DivisionMemberNotFoundError } from "./errors";
import type { DivisionSetupTx } from "./setup-store";

/**
 * Member を決める。既存を選んだ場合は組織を where に入れて確かめる。
 * 取ってから所属を検証する形にすると、検証の書き忘れがそのまま穴になる。
 */
export const resolveMemberId = async (
  tx: DivisionSetupTx,
  organizationId: string,
  input: AddEntryInput,
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
    throw new DivisionMemberNotFoundError({ memberId: input.memberId });
  }
  return member.id;
};

/**
 * この大会で使われている選手番号を集め、次の番号を決める。
 * 規則そのものは lib/participant/player-number.ts が持つ（大会への
 * 直接追加と同じ規則にするため）。ここは材料を集めるだけ。
 */
const nextPlayerNumberFor = async (
  tx: DivisionSetupTx,
  tournamentId: string,
): Promise<string> => {
  const rows = await tx.participant.findMany({
    where: { tournamentId },
    select: { playerNumber: true },
  });
  return nextPlayerNumber(rows.map((row) => row.playerNumber));
};

/**
 * この大会の Participant を用意する。同じ人が複数の部門に出ることがあるので、
 * 既にあれば使い回す。seed は付けない（@@unique([tournamentId, seed]) と衝突するため。
 * Postgres は NULL の重複を許すので null なら安全）。
 */
export const resolveParticipantId = async (
  tx: DivisionSetupTx,
  tournamentId: string,
  memberId: string,
): Promise<string> => {
  const existing = await tx.participant.findFirst({
    where: { tournamentId, memberId },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const created = await tx.participant.create({
    data: {
      tournamentId,
      memberId,
      playerNumber: await nextPlayerNumberFor(tx, tournamentId),
    },
    select: { id: true },
  });
  return created.id;
};
