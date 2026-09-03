import "server-only";

import { prisma } from "@/shared/db/prisma";
import { type RandomSuffix, usernameCandidates } from "./username";

export type UsernameExistsPort = (username: string) => Promise<boolean>;

export const usernameExistsInDb: UsernameExistsPort = async (username) =>
  (await prisma.user.count({ where: { username } })) > 0;

/**
 * 候補を順に試して最初に空いているものを返す。
 *
 * 候補の生成（純粋）と空きの確認（DB 読み）を分けてあるのは、生成側だけを
 * 単体テストで詰められるようにするため。候補は有限件で打ち切られるので、
 * ここは有限回で必ず止まる。連番が尽きてもランダム接尾辞の候補が続くため、
 * 実際に行き止まりになることはまず無い（連番だけだった頃は、素が 20 件
 * 埋まった組織メールの既存ユーザーがサインインのたびに落ちていた）。
 * それでも全部埋まっていたら黙って諦めず例外にする。
 */
export const findAvailableUsername = async (
  base: string,
  exists: UsernameExistsPort = usernameExistsInDb,
  randomSuffix?: RandomSuffix,
): Promise<string> => {
  for (const candidate of usernameCandidates(base, randomSuffix)) {
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `利用可能な username を生成できませんでした（base: ${base}）。候補がすべて使用済みです。`,
  );
};
