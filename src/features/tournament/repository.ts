import "server-only";
import type { TournamentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export type TournamentSummary = {
  id: string;
  name: string;
  startsAt: Date | null;
  status: TournamentStatus;
};

export type TournamentDetail = TournamentSummary & {
  createdAt: Date;
};

/** 大会一覧。startsAt は nullable で未設定の位置が定まらないため createdAt で並べる。 */
export const listTournamentsInOrganization = (
  organizationId: string,
): Promise<TournamentSummary[]> =>
  prisma.tournament.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, startsAt: true, status: true },
  });

/**
 * organizationId を where に含めるのが横断アクセス防止の要。
 * id だけで引いて後から所属を検証する形にすると、検証を書き忘れた箇所が
 * そのまま穴になる。この形なら書き忘れは「見つからない」に倒れる。
 */
export const findTournamentInOrganization = (
  organizationId: string,
  tournamentId: string,
): Promise<TournamentDetail | null> =>
  prisma.tournament.findFirst({
    where: { id: tournamentId, organizationId },
    select: {
      id: true,
      name: true,
      startsAt: true,
      status: true,
      createdAt: true,
    },
  });
