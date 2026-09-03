import "server-only";
import type { DivisionFormat } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export type DivisionSummary = {
  id: string;
  name: string;
  order: number;
  format: DivisionFormat;
};

/**
 * Json 3 列は Prisma が JsonValue で返す。ここでは形を保証せず unknown として運び、
 * 検証は lib/division の parse 関数に任せる。
 */
export type DivisionDetail = DivisionSummary & {
  entries: unknown;
  matchingConfig: unknown;
  results: unknown;
  createdAt: Date;
};

/** ブラケット描画とエントリー一覧に渡す参加者。表示名は Member から解決済み。 */
export type DivisionParticipant = {
  id: string;
  name: string;
  nameKana: string;
  team?: string;
};

/**
 * 部門一覧。order 昇順で並べて返す。削除は order を詰め直さないため、
 * 欠番があることは前提として扱う（reorder/domain.ts 参照）。
 * where を tournament 経由にすることで、組織と大会の所有権を 1 クエリで担保する。
 */
export const listDivisionsInTournament = (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionSummary[]> =>
  prisma.division.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true, format: true },
  });

/**
 * 組織 → 大会 → 部門の 3 段の所有権を where に入れる。
 * id だけで引いて後から所属を検証する形にすると、検証を書き忘れた箇所が
 * そのまま穴になる。この形なら書き忘れは「見つからない」に倒れる。
 */
export const findDivisionInTournament = (
  organizationId: string,
  tournamentId: string,
  divisionId: string,
): Promise<DivisionDetail | null> =>
  prisma.division.findFirst({
    where: { id: divisionId, tournament: { id: tournamentId, organizationId } },
    select: {
      id: true,
      name: true,
      order: true,
      format: true,
      entries: true,
      matchingConfig: true,
      results: true,
      createdAt: true,
    },
  });

/**
 * 大会の参加者。表示名は Participant ではなく Member が持つため join して解決する。
 * 解決済みの形で返すことで、描画側のアダプタ（features/bracket/from-division.ts）を
 * DB を知らない純粋関数に保てる。
 */
export const listParticipantsInTournament = async (
  organizationId: string,
  tournamentId: string,
): Promise<DivisionParticipant[]> => {
  const rows = await prisma.participant.findMany({
    where: { tournament: { id: tournamentId, organizationId } },
    select: {
      id: true,
      team: true,
      member: { select: { name: true, nameKana: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.member.name,
    nameKana: row.member.nameKana,
    // bracket 側の Participant.team は省略可能なプロパティ。null は運ばない。
    team: row.team ?? undefined,
  }));
};
