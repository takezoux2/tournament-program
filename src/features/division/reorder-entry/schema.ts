import { z } from "zod";

export const reorderEntrySchema = z.object({
  entryId: z.string().min(1, "エントリーの指定が不正です"),
  direction: z.enum(["up", "down"], { error: "並べ替えの向きが不正です" }),
});

export type ReorderEntryInput = z.infer<typeof reorderEntrySchema>;
