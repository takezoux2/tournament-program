import type { BetterAuthPlugin } from "better-auth";
import { username } from "better-auth/plugins/username";
import { usernameAdditionalField } from "@/shared/lib/auth-user-fields";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  USERNAME_PATTERN,
  USERNAME_PLUGIN_DISPLAY_USERNAME,
} from "@/shared/lib/username";

/**
 * 素のプラグイン。既定値のままだとこのプロジェクトの規則と食い違う。
 * - 文字種の既定は /^[a-zA-Z0-9_.]+$/ で、"." を許し "-" を許さない
 * - 長さの既定は 3〜30 文字
 * どちらも signup が受け付けた名前を後からログインで弾く向きにずれるため、
 * username.ts の定数で上書きする。
 *
 * displayUsername を切っているのは、User テーブルにその列が無いため。
 */
const base = username({
  displayUsername: USERNAME_PLUGIN_DISPLAY_USERNAME,
  minUsernameLength: MIN_USERNAME_LENGTH,
  maxUsernameLength: MAX_USERNAME_LENGTH,
  usernameValidator: (value) => USERNAME_PATTERN.test(value),
});

/**
 * betterAuth({ plugins }) に渡すプラグイン。
 *
 * schema.user.fields.username を usernameAdditionalField で包み直している。
 * better-auth/dist/db/schema.mjs の getFields が
 *   { ...coreSchema, ...user.additionalFields, ...plugin.schema.user.fields }
 * の順で spread するため、素のまま渡すとプラグインの required: false が
 * 既存の required: true と zod validator を上書きしてしまう。そうなると
 * username を省いた直接 POST が API の検証を素通りし、NOT NULL 制約まで
 * 落ちてから FAILED_TO_CREATE_USER になる。
 *
 * unique / sortable / returned はプラグイン側の値を残す（サインイン時の
 * username 検索と重複チェックがそれに乗っている）。
 */

// このアプリは使わない。/is-username-available は未認証でユーザー名の
// 存在を答えるため、置いたままにするとアカウント列挙の口になる。
const { isUsernameAvailable: _isUsernameAvailable, ...endpoints } =
  base.endpoints;

export const usernamePlugin = {
  ...base,
  endpoints,
  schema: {
    ...base.schema,
    user: {
      ...base.schema.user,
      fields: {
        ...base.schema.user.fields,
        username: {
          ...base.schema.user.fields.username,
          ...usernameAdditionalField,
        },
      },
    },
  },
} satisfies BetterAuthPlugin;
