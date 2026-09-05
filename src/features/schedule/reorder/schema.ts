import { z } from "zod";

export const reorderScheduleSchema = z.object({
  keys: z
    .array(z.string().min(1, "並び順が不正です"))
    .min(1, "並び順が不正です"),
});

export type ReorderScheduleInput = z.infer<typeof reorderScheduleSchema>;
