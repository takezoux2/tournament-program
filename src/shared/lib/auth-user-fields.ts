import type { BetterAuthOptions } from "better-auth";
import { normalizeUsername, usernameSchema } from "./username";

type UserAdditionalFields = NonNullable<
  NonNullable<BetterAuthOptions["user"]>["additionalFields"]
>;

/**
 * better-auth の user.additionalFields に渡す username の宣言。
 *
 * auth.ts から切り出してあるのは、あのファイルが import 時に betterAuth() を
 * 組み立てる（server-only と Prisma を引き込む）ため、そのままでは
 * ここの検証をテストできないから。公開エンドポイント
 * `/api/auth/sign-up/email` の入力検証なので、無試験では置けない。
 *
 * validator と transform を両方書いているのは、効く場所が違うため。
 * - validator.input は API 入力の解析時（db/schema.mjs の parseInputData）。
 *   クライアントの signupSchema を通さない直接 POST はここで初めて検査される。
 * - transform.input はアダプタの書き込み時
 *   （@better-auth/core db/adapter/factory.mjs の transformInput）。
 *   parseInputData を経ない書き込み経路でも小文字化を効かせる。
 * なお parseInputData は validator が付いていると transform を飛ばす
 * （schema.mjs の continue）ので、正規化は validator 側にも入れてある。
 */
export const usernameAdditionalField: UserAdditionalFields[string] = {
  type: "string",
  required: true,
  input: true,
  transform: {
    // 文字列以外は正規化しようがないので触らない（必須欠落は
    // parseInputData の MISSING_FIELD が受け持つ）。
    input: (value) =>
      typeof value === "string" ? normalizeUsername(value) : value,
  },
  validator: { input: usernameSchema },
};
