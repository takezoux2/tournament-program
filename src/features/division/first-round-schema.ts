import { z } from "zod";

export const matchIdSchema = z.string().min(1, "試合の指定が不正です");

/** 1 回戦のどのスロットか。FormData は文字列なので "0" / "1" を受けて数値にする。 */
export const slotTargetSchema = z.object({
  matchId: matchIdSchema,
  slotIndex: z
    .enum(["0", "1"], { error: "スロットの指定が不正です" })
    .transform((value): 0 | 1 => (value === "0" ? 0 : 1)),
});

export type SlotTarget = z.infer<typeof slotTargetSchema>;

/** 全フォームが hidden で送る 3 つの id。 */
export const readDivisionIds = (formData: FormData) => ({
  slug: String(formData.get("slug") ?? ""),
  tournamentId: String(formData.get("tournamentId") ?? ""),
  divisionId: String(formData.get("divisionId") ?? ""),
});
