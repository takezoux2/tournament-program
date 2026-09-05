import { z } from "zod";

/** 挿入位置。空文字は「先頭に挿す」（domain の HEAD_ANCHOR_KEY と対）。 */
export const insertDividerSchema = z.object({
  anchorKey: z.string(),
});

export type InsertDividerInput = z.infer<typeof insertDividerSchema>;

/** 挿入直後のラベル。画面のインラインフォームで書き換える前提の仮の名前。 */
export const DEFAULT_DIVIDER_LABEL = "区切り";
