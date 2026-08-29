import { z } from "zod";
import { startsAtSchema, tournamentNameSchema } from "../schema-parts";

/**
 * 入力の形は作成時と同じだが、create から import はしない（同列スライスへの
 * 依存は禁止）。共通の部品は features/tournament 直下の schema-parts.ts に置き、
 * 両スライスがそこを祖先方向に参照する。
 */
export const updateTournamentSchema = z.object({
  name: tournamentNameSchema,
  startsAt: startsAtSchema,
});

export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
