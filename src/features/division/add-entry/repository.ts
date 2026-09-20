import "server-only";
import { randomUUID } from "node:crypto";
import type { Effect } from "effect";
import type { DivisionEntries } from "@/lib/division/types";
import { nextPlayerNumber } from "@/lib/participant/player-number";
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

/**
 * 追加の結果。組み合わせを作り直したかどうかを分けて返すのは、
 * 画面の通知が事実とずれないようにするため。reorder-entry と同じ理由。
 */
export type AddEntryResult = { regenerated: boolean };

export type AddEntryPort = (
  ids: DivisionIds,
  input: AddEntryInput,
) => Effect.Effect<DivisionSetupOutcome<AddEntryResult>, DivisionError>;

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
      playerNumber: await nextPlayerNumberFor(tx, tournamentId),
    },
    select: { id: true },
  });
  return created.id;
};

export const addEntryInDb: AddEntryPort = (ids, input) =>
  runDivisionSetup<AddEntryResult>(ids, async (tx, current) => {
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
      value: {
        // applyEntryAdded は作り直さなかったとき current.matchingConfig を
        // そのまま返す（参照が同じ）。reorder-entry/repository.ts と同じ
        // 判別方法。
        regenerated: matchingConfig !== current.matchingConfig,
      },
    };
  });
