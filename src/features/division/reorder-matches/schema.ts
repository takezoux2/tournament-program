import { z } from "zod";

export const reorderMatchesSchema = z.object({
  matchIds: z
    .array(z.string().min(1, "並び順が不正です"))
    .min(1, "並び順が不正です"),
});

export type ReorderMatchesInput = z.infer<typeof reorderMatchesSchema>;
