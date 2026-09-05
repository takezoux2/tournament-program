-- requireEmailVerification を有効にすると、emailVerified が false のユーザーは
-- ログインできなくなる。User.emailVerified は @default(false) で、この変更まで
-- true になる経路が無かったため、既存ユーザーは全員が該当する。
-- 認証メールの仕組みより前に登録した人は本登録済みとして扱う。
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;
