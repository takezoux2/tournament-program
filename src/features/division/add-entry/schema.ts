import { z } from "zod";

const trimmedName = (label: string) =>
  z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, `${label}を入力してください`)
        .max(100, `${label}は100文字以内で入力してください`),
    );

/**
 * 既存 Member を選ぶか、新しく登録するかの二択。フォームのラジオ mode が
 * どちらかを決める。discriminatedUnion にすることで、mode ごとに
 * 必要な項目だけを要求できる。
 */
export const addEntrySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    memberId: z.string().min(1, "メンバーを選択してください"),
  }),
  z.object({
    mode: z.literal("new"),
    name: trimmedName("氏名"),
    nameKana: trimmedName("氏名（かな）"),
  }),
]);

export type AddEntryInput = z.infer<typeof addEntrySchema>;
