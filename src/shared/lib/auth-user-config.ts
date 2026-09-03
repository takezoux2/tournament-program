import type { BetterAuthOptions } from "better-auth";
import { usernameAdditionalField } from "@/shared/lib/auth-user-fields";

/**
 * betterAuth({ user: ... }) にそのまま渡す設定。
 *
 * auth.ts から切り出してあるのは、あのファイルを import すると
 * betterAuth() が Prisma アダプタを組み立てて DB に触れに行き、
 * テストが固まる（実際に import すると 5 秒のタイムアウトで落ちる）ため。
 * ここを分けておけば、auth.ts が usernameAdditionalField を確かに使っている
 * ことを DB 抜きで確認できる。
 */
export const authUserConfig = {
  // username は User テーブルの必須列。ここに宣言しないと signUp の
  // 入力から落とされ、NOT NULL 制約で登録が失敗する。
  // 中身（正規化と検証）は auth-user-fields.ts にある。
  additionalFields: { username: usernameAdditionalField },
} satisfies NonNullable<BetterAuthOptions["user"]>;
