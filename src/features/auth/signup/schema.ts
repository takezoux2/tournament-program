import { z } from "zod";
import { displayNameSchema } from "@/shared/lib/display-name";
import { normalizeEmail } from "@/shared/lib/email";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/shared/lib/password-policy";
import { usernameSchema } from "@/shared/lib/username";

export const signupSchema = z.object({
  // 規則は shared に 1 つだけ持つ。プロフィールの変更側と同じものを使わないと
  // 「登録では通るのに変更で弾かれる」ずれが起きる。
  name: displayNameSchema,
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
