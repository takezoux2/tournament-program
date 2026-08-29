import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/shared/db/prisma";
import {
  BYPASS_USER_ID_COOKIE,
  type BypassSession,
  buildBypassSession,
  isAuthBypassEnabled,
} from "@/shared/lib/auth-bypass";

/**
 * 開発用バイパスのセッションを取得する。`USER_ID` Cookie の値を `User.id` として
 * 引き当て、そのユーザーになりすます。BYPASS_AUTH=1 のときだけ動く裏口であり、
 * Better Auth の署名検証を一切通らない。本番環境では有効にしないこと。
 *
 * バイパスが使えない条件（無効・Cookie 無し・該当ユーザー無し）では null を返し、
 * 呼び出し側が通常の認証へフォールバックできるようにしている。
 */
export const getBypassSession = async (): Promise<BypassSession | null> => {
  if (!isAuthBypassEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const userId = cookieStore.get(BYPASS_USER_ID_COOKIE)?.value;
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return null;
  }

  return buildBypassSession(user, new Date());
};
