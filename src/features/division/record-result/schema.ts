import { z } from "zod";

/**
 * winnerEntryId は勝者の DivisionEntry.id。空文字は「記録を取り消す」を表す。
 * 画面の「取り消し」ボタンが value="" で送る。
 */
export const recordResultSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  winnerEntryId: z.string(),
});

export type RecordResultInput = z.infer<typeof recordResultSchema>;
