import "server-only";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/shared/db/prisma";
import { buildPasswordResetEmail } from "@/shared/lib/auth-password-reset-email";
import { authUserConfig } from "@/shared/lib/auth-user-config";
import { usernamePlugin } from "@/shared/lib/auth-username-plugin";
import { buildVerificationEmail } from "@/shared/lib/auth-verification-email";
import { VERIFICATION_LINK_EXPIRES_IN_SECONDS } from "@/shared/lib/email-verification-policy";
import { getMailer, resolveMailFrom } from "@/shared/lib/mail";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS } from "@/shared/lib/password-reset-policy";
import { usernameBaseFromEmail } from "@/shared/lib/username";
import { findAvailableUsername } from "@/shared/lib/username-availability";

export const auth = betterAuth({
  // 未設定だと Google が受け取るコールバック URL が組み立てられず redirect_uri_mismatch になる。
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // 仮登録（emailVerified = false）のままではサインインさせない。
    // これを立てると sign-up 側で autoSignIn が常に無効化されるため
    // （better-auth/dist/api/routes/sign-up.mjs の shouldSkipAutoSignIn）、
    // autoSignIn は書かない。書くと有効に見えて紛らわしい。
    //
    // 副作用として、既存メールでの登録要求はエラーではなく「成功したふり」の
    // 汎用レスポンスになる（アカウント列挙対策）。そのため登録画面は
    // 成否によらず「確認メールを送信しました」を出す。
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    // Better Auth は sendResetPassword が無いと /request-password-reset を
    // RESET_PASSWORD_DISABLED で拒否する（api/routes/password.mjs）。
    sendResetPassword: async ({ user, url }) => {
      await getMailer().send(
        buildPasswordResetEmail({
          from: resolveMailFrom(process.env),
          to: { email: user.email, name: user.name },
          url,
        }),
      );
    },
    resetPasswordTokenExpiresIn: PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS,
    // パスワードリセットは乗っ取りからの復帰手段でもあるため、他端末の
    // セッションを残さない。既定は false。
    revokeSessionsOnPasswordReset: true,
    // リセットリンクを開けたこと自体がメール所有の証明なので、未確認のまま
    // 残っていたアカウントをここで本登録に引き上げる。これをしないと
    // requireEmailVerification によりリセット直後のログインが
    // EMAIL_NOT_VERIFIED で弾かれ、確認メールをもう 1 通踏ませることになる。
    // Better Auth はこのフックを deleteUserSessions より先に呼ぶため、
    // 更新はセッション失効の前に走る。
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    },
  },
  emailVerification: {
    expiresIn: VERIFICATION_LINK_EXPIRES_IN_SECONDS,
    // 仮登録のままログインを試したら確認メールを送り直す。
    // 期限切れからの復帰がログイン操作だけで完結し、再送専用の画面が要らなくなる。
    sendOnSignIn: true,
    // リンクを開いた端末（メールを見たスマホなど）をログイン状態にしない。
    // 認証だけ済ませ、ログインは本人が使う端末で改めて行ってもらう。
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await getMailer().send(
        buildVerificationEmail({
          from: resolveMailFrom(process.env),
          to: { email: user.email, name: user.name },
          url,
        }),
      );
    },
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
  // usernamePlugin は /sign-in/username を生やす。中身（規則の上書きと
  // username フィールドの包み直し）は auth-username-plugin.ts にある。
  // nextCookies は Server Action から Cookie を書けるようにする。plugins 配列の
  // 最後に置く必要がある。
  plugins: [usernamePlugin, nextCookies()],
});
