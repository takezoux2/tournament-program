import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";

/**
 * リセット申請フォームの入力。
 * Better Auth の /request-password-reset はメールアドレスしか受け付けない。
 * ログイン画面はユーザー名も通すが、ユーザー名からメールを引く処理を自作
 * すると応答差やタイミング差でアカウントの存在が漏れる経路を新たに作る
 * ことになるため、ここはメールアドレスに限る。
 */
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

/**
 * 再設定フォームの入力。
 * 確認用との一致はフォームではなくここで見る。検証の置き場所を 1 つに
 * まとめておけば、画面を増やしても規則がずれない。confirmPassword は
 * サーバーへは送らない（usecase 側で newPassword だけを取り出す）。
 */
export const passwordResetSchema = z
  .object({
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
      ),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "確認用のパスワードが一致しません",
    path: ["confirmPassword"],
  });

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
