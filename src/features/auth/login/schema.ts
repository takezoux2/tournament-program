import { z } from "zod";
import { loginIdentifierSchema } from "./identifier";

export const loginSchema = z.object({
  // ユーザー名とメールアドレスのどちらでも受け付ける。振り分けは identifier.ts。
  identifier: loginIdentifierSchema,
  // 既存ユーザーのパスワードがポリシー変更前の長さでも弾かないよう、
  // ここでは空でないことだけを確認する。
  password: z.string().min(1, "パスワードを入力してください"),
});

export type LoginInput = z.infer<typeof loginSchema>;
