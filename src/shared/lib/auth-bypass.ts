import type { UserModel } from "@/generated/prisma/models";
import type { auth } from "@/shared/lib/auth";

/**
 * 開発用の認証バイパスの純粋な部分。副作用（Cookie / DB）は
 * auth-bypass-session.ts 側に置き、ここは単体テストできる形に保つ。
 *
 * 危険性: BYPASS_AUTH=1 を立てると、この Cookie に User.id を書くだけで
 * 誰にでもなりすませる。署名検証もパスワード確認も一切行わない完全な裏口であり、
 * 本番環境では絶対に設定してはならない。
 */

/** バイパス時に参照する Cookie 名。値は `User.id` をそのまま入れる。 */
export const BYPASS_USER_ID_COOKIE = "USER_ID";

/** バイパスセッションの見かけ上の有効期間（24 時間）。 */
const BYPASS_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * `auth.api.getSession()` の戻り値そのもの。呼び出し側が
 * 「通常セッションかバイパスか」で型を分岐せずに済むよう、形を合わせる。
 */
export type BypassSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/**
 * バイパスの唯一のスイッチ。`"1"` の完全一致に限定しているのは、
 * `"0"` や `"false"` のような「無効のつもりの値」で裏口が開かないようにするため。
 */
export const isAuthBypassEnabled = () => process.env.BYPASS_AUTH === "1";

/**
 * User 行と現在時刻からセッション相当のオブジェクトを組み立てる純粋関数。
 * 時刻を引数で受け取るのはテストで固定できるようにするため。
 *
 * session.id / token は DB に実体を持たないため、User.id から機械的に導出する。
 */
export const buildBypassSession = (
  user: UserModel,
  now: Date,
): BypassSession => ({
  session: {
    id: `bypass-${user.id}`,
    token: `bypass-${user.id}`,
    userId: user.id,
    expiresAt: new Date(now.getTime() + BYPASS_SESSION_DURATION_MS),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  },
});
