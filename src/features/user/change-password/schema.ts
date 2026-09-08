import { z } from "zod";
import { newPasswordSchema } from "@/shared/lib/password-policy";

export const changePasswordSchema = z
  .object({
    // 現在のパスワードは長さで弾かない。ポリシーを変える前に登録した
    // 短いパスワードの人が、変更操作そのものをできなくなってしまうため。
    currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
    newPassword: newPasswordSchema,
  })
  // Better Auth 側は同じ値への変更を拒まない。黙って「変更しました」と
  // 出るのは誤解を招くので、ここで弾く。
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "現在と違うパスワードを入力してください",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
