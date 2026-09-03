import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { usernameSchema } from "@/shared/lib/username";

export const signupSchema = z.object({
  name: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "名前を入力してください")
        .max(100, "名前は100文字以内で入力してください"),
    ),
  // フォームとサーバ側（better-auth の additionalFields）で規則がずれると
  // 直接 POST で迂回できてしまうため、規則そのものは shared に 1 つだけ持つ。
  username: usernameSchema,
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`,
    )
    .max(
      MAX_PASSWORD_LENGTH,
      `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください`,
    ),
});

export type SignupInput = z.infer<typeof signupSchema>;
