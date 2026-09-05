import { z } from "zod";

// <input type="datetime-local"> が送ってくる値は YYYY-MM-DDTHH:mm 固定。
// Date.parse はこれよりずっと広い形式（日付のみ、タイムゾーン付きなど）も
// 受け付けてしまうため、正規表現で入力欄が実際に出力する形に絞る。
// features/tournament/schema-parts.ts の startsAtSchema と同じ考え方だが、
// 同列カテゴリなので共有せずこちらに持つ。
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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
   * 開始予定時刻は任意。未入力は空文字で送られてくるので null に畳む。
   * Date.parse はローカル時刻として解釈するので、表示側の
   * toDateTimeLocalValue と対になる。
   */
  startsAt: z
    .string()
    .transform((raw) => raw.trim())
    .refine(
      (value) =>
        value === "" ||
        (DATETIME_LOCAL_PATTERN.test(value) &&
          !Number.isNaN(Date.parse(value))),
      "開始予定時刻の形式が正しくありません",
    )
    .transform((value) => (value === "" ? null : new Date(value))),
});

export type UpdateDividerInput = z.infer<typeof updateDividerSchema>;
