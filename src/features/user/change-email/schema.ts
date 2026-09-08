import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";

/**
 * ログイン・登録と同じ normalizeEmail を通す。ここだけ正規化がずれると、
 * 変更後に自分のアドレスでログインできない、という形で壊れる。
 */
export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
