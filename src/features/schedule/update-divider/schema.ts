import { z } from "zod";
import { optionalDateTimeLocalSchema } from "@/lib/datetime/local";

export const updateDividerSchema = z.object({
  itemId: z.string().min(1, "区切りの指定が不正です"),
  label: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "見出しを入力してください")
        .max(100, "見出しは100文字以内で入力してください"),
    ),
  /**
   * 開始予定時刻は任意。形式の検証とパースは src/lib/datetime/local.ts が持つ。
   * 表示側（サーバで組み立てる ScheduleRowView.startsAtInput）と同じモジュールの
   * toDateTimeLocalValue と対になる。
   */
  startsAt: optionalDateTimeLocalSchema("開始予定時刻の形式が正しくありません"),
});

export type UpdateDividerInput = z.infer<typeof updateDividerSchema>;
