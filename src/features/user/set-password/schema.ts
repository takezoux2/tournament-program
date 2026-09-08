import { z } from "zod";
import { newPasswordSchema } from "@/shared/lib/password-policy";

/**
 * 現在のパスワードを受け取らない。この操作が使えるのはそもそも
 * パスワードを持たない人（Google だけで登録した人）だけであり、
 * 本人確認はセッションが担っている。
 *
 * 長さの規則は change-password と同じ newPasswordSchema を使う。
 */
export const setPasswordSchema = z.object({
  newPassword: newPasswordSchema,
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
