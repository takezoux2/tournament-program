import { z } from "zod";

export const removeDividerSchema = z.object({
  itemId: z.string().min(1, "区切りの指定が不正です"),
});

export type RemoveDividerInput = z.infer<typeof removeDividerSchema>;
