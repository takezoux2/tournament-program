import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/shared/db/prisma";
import { authUserConfig } from "@/shared/lib/auth-user-config";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { usernameBaseFromEmail } from "@/shared/lib/username";
import { findAvailableUsername } from "@/shared/lib/username-availability";

export const auth = betterAuth({
  // 未設定だと Google が受け取るコールバック URL が組み立てられず redirect_uri_mismatch になる。
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // Google のプロフィールに username は無い。additionalFields で必須に
      // しているため、補わないと新規ユーザーの初回サインインが
      // MISSING_FIELD で落ちる（better-auth/dist/oauth2/link-account.mjs の
      // 新規作成分岐）。ここで返した値は getUserInfo の結果にマージされ、
      // そのまま createUser の入力になる。
      //
      // 既存ユーザーのサインインでも呼ばれるが、更新分岐は
      // overrideUserInfoOnSignIn（既定 false）が要るため、
      // 既にある username が書き換わることはない。
      mapProfileToUser: async (profile) => ({
        username: await findAvailableUsername(
          usernameBaseFromEmail(profile.email ?? ""),
        ),
      }),
    },
  },
  // username の宣言（additionalFields）は auth-user-config.ts に切り出してある。
  // auth-user-config.test.ts がその配線を usernameAdditionalField との
  // 同一性で固定しているので、ここではそのまま渡すだけにする。
  user: authUserConfig,
  account: {
    // Google は検証済みのメールアドレスを返すため、同じメールの既存ユーザーへ
    // メール確認を挟まずに連携してよい。
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  // nextCookies は Server Action から Cookie を書けるようにする。plugins 配列の
  // 最後に置く必要がある。
  plugins: [nextCookies()],
});
