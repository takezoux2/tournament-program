import { z } from "zod";

/**
 * 1 回戦のスロット添字。範囲の上限はスロット数に依存するので、
 * ここでは形だけを見て、実際の範囲は repository が現物と突き合わせる。
 *
 * z.coerce.number() は空文字を 0 に変換してしまう（Number("") === 0 のため）。
 * indexA だけが空でも他方が壊れていれば全体としては弾かれてテストは通ってしまうが、
 * それでは空文字が単独で来たときに 0 番目のスロットとして扱われてしまうため、
 * 数値化の前に空文字そのものを弾いておく。
 */
const slotIndexSchema = z
  .string()
  .min(1, "スロットの指定が不正です")
  .transform((value) => Number(value))
  .pipe(
    z
      .number({ error: "スロットの指定が不正です" })
      .int("スロットの指定が不正です")
      .min(0, "スロットの指定が不正です"),
  );

export const swapSlotsSchema = z.object({
  indexA: slotIndexSchema,
  indexB: slotIndexSchema,
});

export type SwapSlotsInput = z.infer<typeof swapSlotsSchema>;
