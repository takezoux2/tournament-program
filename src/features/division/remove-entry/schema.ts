import { z } from "zod";

export const removeEntrySchema = z.object({
  entryId: z.string().min(1, "エントリーの指定が不正です"),
});

export type RemoveEntryInput = z.infer<typeof removeEntrySchema>;
