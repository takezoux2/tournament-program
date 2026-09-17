import Mustache from "mustache";
import { z } from "zod";

/**
 * mustache として読める文字列かどうか。閉じ忘れた区画（{{#a}} だけ など）は
 * 展開時に例外になり、画面ではテンプレートがそのまま出てしまう。保存の前に
 * 弾いて、書いた人がその場で気づけるようにする。
 * 知らない変数は mustache の既定どおり空文字に展開されるだけなので弾かない。
 */
const isParsableTemplate = (value: string): boolean => {
  try {
    Mustache.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const setMatchNameSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchName: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合名を入力してください")
        // 数える対象は展開後ではなくテンプレートそのもの。展開後の長さは
        // 通し番号の桁数で変わり、保存できるかどうかが後から変わってしまう。
        .max(100, "試合名は100文字以内で入力してください")
        .refine(isParsableTemplate, "試合名の書き方が正しくありません"),
    ),
});

export type SetMatchNameInput = z.infer<typeof setMatchNameSchema>;
