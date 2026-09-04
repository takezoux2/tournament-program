import { z } from "zod";

export const removeMemberSchema = z.object({
  memberId: z.string().min(1, "削除するメンバーを選んでください"),
});

export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
