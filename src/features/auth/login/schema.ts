import { z } from "zod";
import { normalizeEmail } from "@/shared/lib/email";

export const loginSchema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email("メールアドレスの形式が正しくありません")),
  // 既存ユーザーのパスワードがポリシー変更前の長さでも弾かないよう、
  // ここでは空でないことだけを確認する。
  password: z.string().min(1, "パスワードを入力してください"),
});

export type LoginInput = z.infer<typeof loginSchema>;
