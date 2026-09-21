import "server-only";
import type { DivisionFormat } from "@/generated/prisma/enums";
import {
  buildOverallSeq,
  type OverallOrderDivision,
} from "@/lib/division/overall-order";
import { parseMatchingConfig } from "@/lib/division/parse";
import { prisma } from "@/shared/db/prisma";

export type DivisionSummary = {
  id: string;
  name: string;
  order: number;
  format: DivisionFormat;
};

/**
 * Json 4 列は Prisma が JsonValue で返す。ここでは形を保証せず unknown として運び、
 * 検証は lib/division の parse 関数に任せる。
 */
export type DivisionDetail = DivisionSummary & {
  entries: unknown;
  matchingConfig: unknown;
  results: unknown;
  resultConfig: unknown;
  createdAt: Date;
};

/** ブラケット描画とエントリー一覧に渡す参加者。表示名は Member から解決済み。 */
export type DivisionParticipant = {
  id: string;
  name: string;
  nameKana: string;
  /** 選手番号。大会単位で Participant が持つ */
  playerNumber: string;
  team?: string;
  /**
   * 参加者の Member。setup 画面が「この部門に配置済みの人」を
   * メンバーの選択肢から除くのに使う。一覧以外の経路では埋めないので省略可能。
   */
  memberId?: string;
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
      resultConfig: true,
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
      playerNumber: true,
      member: { select: { id: true, name: true, nameKana: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.member.name,
    nameKana: row.member.nameKana,
    playerNumber: row.playerNumber,
    // bracket 側の Participant.team は省略可能なプロパティ。null は運ばない。
    team: row.team ?? undefined,
    memberId: row.member.id,
  }));
};

/**
 * 大会の全試合の通し番号を読む。試合名の {{OverallSeq}} を展開するのに要る。
 *
 * 所有権は呼び出し側のページが既に確立している（管理画面は
 * requireOrganization と findDivisionInTournament の 3 段 where、公開画面は
 * findPublicTournament の公開ゲート）。ここは番号を作るだけで、
 * 大会 id 以外の絞り込みは行わない。
 *
 * features/schedule にも同じ材料を読む関数があるが、features どうしは
 * 依存できないため別に持つ。並びの規則そのものは lib/division/overall-order.ts
 * の 1 つを共有しているので、番号がずれることはない。
 */
export const listOverallOrderSources = async (
  tournamentId: string,
): Promise<Map<string, number>> => {
  const [divisions, items] = await Promise.all([
    prisma.division.findMany({
      where: { tournamentId },
      orderBy: { order: "asc" },
      select: { id: true, order: true, matchingConfig: true },
    }),
    prisma.scheduleItem.findMany({
      where: { tournamentId, kind: "MATCH" },
      orderBy: { order: "asc" },
      select: { divisionId: true, matchId: true },
    }),
  ]);

  return buildOverallSeq(
    divisions.map(
      (division): OverallOrderDivision => ({
        id: division.id,
        order: division.order,
        // 壊れた Json を持つ部門があっても他の部門の番号は出したいので、
        // その部門だけ試合ゼロとして扱う。
        matchIds: (() => {
          try {
            return parseMatchingConfig(division.matchingConfig).matches.map(
              (match) => match.id,
            );
          } catch {
            return [];
          }
        })(),
      }),
    ),
    // kind: "MATCH" の行は divisionId / matchId を必ず持つが、列としては
    // nullable なので落として渡す。
    items.flatMap((item) =>
      item.divisionId === null || item.matchId === null
        ? []
        : [{ divisionId: item.divisionId, matchId: item.matchId }],
    ),
  );
};
