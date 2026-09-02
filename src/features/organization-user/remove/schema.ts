import { z } from "zod";

export const removeUserSchema = z.object({
  userId: z.string().min(1, "削除するユーザーを選んでください"),
});

export type RemoveUserInput = z.infer<typeof removeUserSchema>;
