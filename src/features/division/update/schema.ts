import { z } from "zod";
import { divisionFormatSchema, divisionNameSchema } from "../schema-parts";

/**
 * 入力の形は作成時と同じだが、create から import はしない（同列スライスへの
 * 依存は禁止）。共通の部品は features/division 直下の schema-parts.ts に置き、
 * 両スライスがそこを祖先方向に参照する。
 */
export const updateDivisionSchema = z.object({
  name: divisionNameSchema,
  format: divisionFormatSchema,
});

export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;
