import { z } from "zod";

export const reorderDivisionSchema = z.object({
  direction: z.enum(["up", "down"], { error: "並べ替えの向きが不正です" }),
});

export type ReorderDivisionInput = z.infer<typeof reorderDivisionSchema>;
