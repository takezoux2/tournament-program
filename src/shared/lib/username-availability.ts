import "server-only";

import { prisma } from "@/shared/db/prisma";
import { usernameCandidates } from "./username";

export type UsernameExistsPort = (username: string) => Promise<boolean>;

export const usernameExistsInDb: UsernameExistsPort = async (username) =>
  (await prisma.user.count({ where: { username } })) > 0;

/**
 * 候補を順に試して最初に空いているものを返す。
 *
 * 候補の生成（純粋）と空きの確認（DB 読み）を分けてあるのは、生成側だけを
 * 単体テストで詰められるようにするため。候補は
 * USERNAME_CANDIDATE_LIMIT 件で打ち切られるので、ここは有限回で必ず止まる。
 * 全部埋まっていたら黙って諦めず例外にする（Google の初回サインインが
 * 失敗するが、意味の分からない名前を割り当てるより追いやすい）。
 */
export const findAvailableUsername = async (
  base: string,
  exists: UsernameExistsPort = usernameExistsInDb,
): Promise<string> => {
  for (const candidate of usernameCandidates(base)) {
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `利用可能な username を生成できませんでした（base: ${base}）。候補がすべて使用済みです。`,
  );
};
