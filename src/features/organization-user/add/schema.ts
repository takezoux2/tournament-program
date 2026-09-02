import { z } from "zod";

export const addUserSchema = z.object({
  // 検索結果から渡ってくる User.id。値の正当性は DB の外部キーが担保する。
  userId: z.string().min(1, "追加するユーザーを選んでください"),
});

export type AddUserInput = z.infer<typeof addUserSchema>;
