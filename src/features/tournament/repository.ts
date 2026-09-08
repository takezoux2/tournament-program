import "server-only";
import { PUBLIC_TOURNAMENT_STATUSES } from "@/features/tournament/status";
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
  /**
   * 公開状態ではなく、閲覧者が組織メンバーであることでゲートを通ったか。
   * 公開可否の判断ではなく、準備中バナーを出すかどうかの表示用フラグ。
   */
  isPreview: boolean;
};

/**
 * 公開ページの唯一の入口。公開してよい状態だけを where で許可リストとして
 * 絞り込むのが要点で、取得してから status で弾く形にはしない。4 つある
 * 公開ページのどれか 1 枚で確認を書き忘れても、この形なら「見つからない」に
 * 倒れる。PUBLIC_TOURNAMENT_STATUSES を除外リストではなく許可リストに
 * してあるのは、TournamentStatus に値が増えたときに書き忘れても
 * 新しい状態が世界に公開されてしまわないようにするため。
 * 組織スコープの findTournamentInOrganization とは別関数にしてあり、
 * 公開の判断がこの 1 箇所に閉じている。
 *
 * viewerUserId は、その大会の組織メンバーに限って準備中（DRAFT）の
 * 大会もプレビューさせるための閲覧者。メンバー判定もリレーションで
 * where に書くため、クエリは 1 本のままで公開の判断はここに閉じたままになる。
 * デフォルト値を付けず必須引数にしてあるのは、呼び出し側で渡し忘れると
 * 型エラーになるようにするため。既定値を与えると、渡し忘れた画面だけ
 * プレビューが黙って効かなくなり、原因が分かりにくい。
 * viewerUserId には必ずセッション由来の値（getOptionalSession() の
 * user.id）だけを渡すこと。URL やクエリ文字列から来た値を渡すと、
 * 閲覧者を名乗るだけで他組織の準備中の大会が見えてしまう。
 */
export const findPublicTournament = async (
  tournamentId: string,
  viewerUserId: string | null,
): Promise<PublicTournament | null> => {
  const row = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      OR: [
        { status: { in: PUBLIC_TOURNAMENT_STATUSES } },
        // 未ログインのときは項自体を組み立てない。空配列の展開なので
        // where の形は従来と同じ（許可されるのは公開状態だけ）になる。
        ...(viewerUserId === null
          ? []
          : [{ organization: { users: { some: { userId: viewerUserId } } } }]),
      ],
    },
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
  return {
    ...rest,
    organizationName: organization.name,
    isPreview: !PUBLIC_TOURNAMENT_STATUSES.includes(row.status),
  };
};
