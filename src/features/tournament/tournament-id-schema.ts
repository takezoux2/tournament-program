import { z } from "zod";

/**
 * publish / unpublish スライスが共有する入力。スライス同士は依存できないため
 * features/tournament 直下に置く。
 */
export const tournamentIdSchema = z.object({
  tournamentId: z.string().min(1, "大会が指定されていません"),
});
