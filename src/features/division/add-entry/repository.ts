import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import {
  DivisionDuplicateEntryError,
  DivisionEntryLimitError,
  type DivisionError,
  DivisionMemberNotFoundError,
} from "../errors";
import { applyEntryAdded, maxEntries } from "../matching-strategy";
import {
  type DivisionIds,
  type DivisionSetupOutcome,
  type DivisionSetupTx,
  runDivisionSetup,
} from "../setup-store";
import type { AddEntryInput } from "./schema";

export type AddEntryPort = (
  ids: DivisionIds,
  input: AddEntryInput,
) => Effect.Effect<DivisionSetupOutcome<null>, DivisionError>;

/**
 * Member を決める。既存を選んだ場合は組織を where に入れて確かめる。
 * 取ってから所属を検証する形にすると、検証の書き忘れがそのまま穴になる。
 */
const resolveMemberId = async (
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
 * 次の選手番号。同じ大会で 10 進整数として読める番号の最大値 + 1。
 * 手入力の "A-1" のような番号は序数を持たないので最大値の計算から外す。
 */
const nextPlayerNumber = async (
  tx: DivisionSetupTx,
  tournamentId: string,
): Promise<string> => {
  const rows = await tx.participant.findMany({
    where: { tournamentId },
    select: { playerNumber: true },
  });
  const max = rows.reduce(
    (acc, row) =>
      /^\d+$/.test(row.playerNumber)
        ? Math.max(acc, Number(row.playerNumber))
        : acc,
    0,
  );
  return String(max + 1);
};

/**
 * この大会の Participant を用意する。同じ人が複数の部門に出ることがあるので、
 * 既にあれば使い回す。seed は付けない（@@unique([tournamentId, seed]) と衝突するため。
 * Postgres は NULL の重複を許すので null なら安全）。
 */
const resolveParticipantId = async (
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
      playerNumber: await nextPlayerNumber(tx, tournamentId),
    },
    select: { id: true },
  });
  return created.id;
};

export const addEntryInDb: AddEntryPort = (ids, input) =>
  runDivisionSetup(ids, async (tx, current) => {
    const limit = maxEntries(current.format);
    if (current.entries.entries.length >= limit) {
      throw new DivisionEntryLimitError({ divisionId: ids.divisionId, limit });
    }

    const memberId = await resolveMemberId(tx, ids.organizationId, input);
    const participantId = await resolveParticipantId(
      tx,
      ids.tournamentId,
      memberId,
    );

    if (
      current.entries.entries.some(
        (entry) => entry.participantId === participantId,
      )
    ) {
      throw new DivisionDuplicateEntryError({ divisionId: ids.divisionId });
    }

    const maxSeed = current.entries.entries.reduce(
      (max, entry) => Math.max(max, entry.seed),
      -1,
    );
    const added = { id: randomUUID(), participantId, seed: maxSeed + 1 };

    const entries: DivisionEntries = {
      version: 1,
      entries: [...current.entries.entries, added],
    };

    // 組み合わせが未作成なら空のまま。生成は運営者が押したときだけ起きる。
    const matchingConfig = applyEntryAdded(
      current.format,
      current.matchingConfig,
      entries.entries,
      added.id,
    );

    return {
      next: { format: current.format, entries, matchingConfig },
      value: null,
    };
  });
