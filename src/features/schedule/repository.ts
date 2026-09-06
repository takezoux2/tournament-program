import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  parseDivisionEntries,
  parseDivisionResults,
  parseMatchingConfig,
} from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";
import { buildScheduleView } from "./domain";
import { parseScheduleItem } from "./parse";
import { buildResultRows, type ResultRowView } from "./result-rows";
import type {
  ScheduleDivision,
  ScheduleItemRecord,
  ScheduleParticipant,
  ScheduleRowView,
} from "./types";

/** トランザクションの中でも外でも同じ読み出しを使えるようにする。 */
type ScheduleReader = Pick<
  Prisma.TransactionClient,
  "division" | "participant" | "scheduleItem"
>;

/**
 * 所有権は 3 本のクエリすべての where にリレーションフィルタで入れる。
 * 取得してから条件で弾く形にすると、書き忘れがそのまま穴になる。
 */
const ownership = (organizationId: string, tournamentId: string) => ({
  tournament: { id: tournamentId, organizationId },
});

const loadDivisions = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleDivision[]> => {
  const rows = await reader.division.findMany({
    where: ownership(organizationId, tournamentId),
    select: {
      id: true,
      name: true,
      order: true,
      entries: true,
      matchingConfig: true,
      results: true,
    },
  });

  // Json のパースはここで済ませ、domain は検証済みの形だけを扱う純粋関数に保つ。
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: row.order,
    entries: parseDivisionEntries(row.entries),
    matchingConfig: parseMatchingConfig(row.matchingConfig),
    results: parseDivisionResults(row.results),
  }));
};

const loadParticipants = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleParticipant[]> => {
  const rows = await reader.participant.findMany({
    where: ownership(organizationId, tournamentId),
    select: { id: true, member: { select: { name: true } } },
  });

  return rows.map((row) => ({ id: row.id, name: row.member.name }));
};

const loadItems = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleItemRecord[]> => {
  const rows = await reader.scheduleItem.findMany({
    where: ownership(organizationId, tournamentId),
    orderBy: { order: "asc" },
    select: {
      id: true,
      kind: true,
      divisionId: true,
      matchId: true,
      label: true,
      startsAt: true,
    },
  });

  return rows.flatMap((row) => {
    const parsed = parseScheduleItem(row);
    return parsed === null ? [] : [parsed];
  });
};

type ScheduleMaterials = {
  divisions: ScheduleDivision[];
  participants: ScheduleParticipant[];
  items: ScheduleItemRecord[];
};

/** 3 本のクエリをまとめて投げる。進行順の一覧と結果入力の両方が使う。 */
const loadMaterials = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleMaterials> => {
  const [divisions, participants, items] = await Promise.all([
    loadDivisions(reader, organizationId, tournamentId),
    loadParticipants(reader, organizationId, tournamentId),
    loadItems(reader, organizationId, tournamentId),
  ]);
  return { divisions, participants, items };
};

/**
 * 一覧の行をマージ済みの形で読む。ページと schedule-store の両方が使う。
 * 読み出しは副作用を持たない（行のずれを直すのは次の保存）。
 */
export const readScheduleRows = async (
  reader: ScheduleReader,
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleRowView[]> => {
  const { divisions, participants, items } = await loadMaterials(
    reader,
    organizationId,
    tournamentId,
  );

  return buildScheduleView(divisions, participants, items);
};

/** ページから呼ぶ読み出し。 */
export const loadScheduleView = (
  organizationId: string,
  tournamentId: string,
): Promise<ScheduleRowView[]> =>
  readScheduleRows(prisma, organizationId, tournamentId);

/** 結果入力ページから呼ぶ読み出し。並びは試合一覧と同じ。 */
export const loadResultRows = async (
  organizationId: string,
  tournamentId: string,
): Promise<ResultRowView[]> => {
  const { divisions, participants, items } = await loadMaterials(
    prisma,
    organizationId,
    tournamentId,
  );

  return buildResultRows(
    buildScheduleView(divisions, participants, items),
    divisions,
    participants,
  );
};
