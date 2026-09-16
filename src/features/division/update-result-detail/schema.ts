import { z } from "zod";
import {
  MAX_NOTE_LENGTH,
  MAX_SCORE_COUNT,
  MAX_SCORE_VALUE,
} from "@/lib/division/types";

const scoreRangeMessage = `スコアは0以上${MAX_SCORE_VALUE}以下で入力してください`;

/**
 * 未入力は null。union ではなく nullable にしているのは、union だと
 * issues[0].message が "invalid_union" になって画面に出す文言が作れないため。
 */
const scoreValueSchema = z
  .number({ error: "スコアは数値で入力してください" })
  .min(0, scoreRangeMessage)
  .max(MAX_SCORE_VALUE, scoreRangeMessage)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    "スコアは小数第2位まで入力できます",
  )
  .nullable();

/**
 * entryId はクライアントが送ってくるが信用しない。repository がその試合に
 * 立っている 2 人と突き合わせ、一致しないものは捨てる。
 */
const scoreEntrySchema = z.object({
  entryId: z.string().min(1, "スコアの対象が不正です"),
  values: z
    .array(scoreValueSchema)
    .max(MAX_SCORE_COUNT, "スコアの数が多すぎます"),
});

export const updateResultDetailSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  /** 空文字は「勝因を解除する」を表す */
  winReason: z.string(),
  scores: z.array(scoreEntrySchema).max(2, "スコアの対象が不正です"),
  note: z
    .string()
    .max(MAX_NOTE_LENGTH, `メモは${MAX_NOTE_LENGTH}文字以内で入力してください`),
});

export type UpdateResultDetailInput = z.infer<typeof updateResultDetailSchema>;
