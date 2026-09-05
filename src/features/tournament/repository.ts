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
  description: string;
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
      description: true,
    },
  });

export type PublicTournament = TournamentDetail & {
  organizationId: string;
  organizationName: string;
};

/**
 * 公開ページの唯一の入口。DRAFT を where で除外するのが要点で、
 * 取得してから status で弾く形にはしない。4 つある公開ページの
 * どれか 1 枚で確認を書き忘れても、この形なら「見つからない」に倒れる。
 * 組織スコープの findTournamentInOrganization とは別関数にしてあり、
 * 公開の判断がこの 1 箇所に閉じている。
 */
export const findPublicTournament = async (
  tournamentId: string,
): Promise<PublicTournament | null> => {
  const row = await prisma.tournament.findFirst({
    where: { id: tournamentId, status: { not: "DRAFT" } },
    select: {
      id: true,
      name: true,
      startsAt: true,
      status: true,
      createdAt: true,
      description: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  if (row === null) {
    return null;
  }

  // organization.name はここで平す。ネストしたまま運ぶと、
  // 画面側が Prisma の select の形を知ることになる。
  const { organization, ...rest } = row;
  return { ...rest, organizationName: organization.name };
};
