import "server-only";
import { prisma } from "@/shared/db/prisma";

/** Better Auth がパスワード用のアカウントに使う providerId。 */
const CREDENTIAL_PROVIDER_ID = "credential";

/** このアプリが対応する唯一の OAuth プロバイダ。 */
export const GOOGLE_PROVIDER_ID = "google";

export type LinkedAccounts = {
  /** パスワードでログインできるか。 */
  hasPassword: boolean;
  /** Google 連携。未連携なら null。 */
  google: { accountId: string; linkedAt: Date } | null;
};

/**
 * 連携アカウントの状態を読む。
 *
 * auth.api.listUserAccounts ではなく Prisma を直接引くのは、BYPASS_AUTH=1 の
 * ときに Better Auth のセッションが存在せず、auth.api.* が UNAUTHORIZED に
 * なってプロフィール画面自体が開けなくなるため。architecture.md は
 * 「認証テーブルへの DB 操作は Better Auth のアダプタが所有する」と定めているが、
 * ここは読み取りの射影に限る例外とする。書き込みは一切通さない。
 *
 * password はハッシュそのものを画面へ運ばないよう、真偽値に畳んでから返す。
 */
export const findLinkedAccounts = async (
  userId: string,
): Promise<LinkedAccounts> => {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      id: true,
      providerId: true,
      password: true,
      createdAt: true,
    },
  });

  const credential = accounts.find(
    (account) => account.providerId === CREDENTIAL_PROVIDER_ID,
  );
  const google = accounts.find(
    (account) => account.providerId === GOOGLE_PROVIDER_ID,
  );

  return {
    // 行の存在ではなく password の中身を見る。setPassword は credential 行を
    // 作ってから password を埋めるため、行だけでは判定にならない。
    hasPassword: Boolean(credential?.password),
    google: google
      ? { accountId: google.id, linkedAt: google.createdAt }
      : null,
  };
};
