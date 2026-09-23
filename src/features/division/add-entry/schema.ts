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

/** 既存の Member を選ぶ枝。1 回戦のスロット編集からも使う。 */
export const existingMemberSchema = z.object({
  mode: z.literal("existing"),
  memberId: z.string().min(1, "メンバーを選択してください"),
});

/** その場で Member を作る枝。1 回戦のスロット編集からも使う。 */
export const newMemberSchema = z.object({
  mode: z.literal("new"),
  name: trimmedName("氏名"),
  nameKana: trimmedName("氏名（かな）"),
});

/**
 * 既存 Member を選ぶか、新しく登録するかの二択。フォームのラジオ mode が
 * どちらかを決める。discriminatedUnion にすることで、mode ごとに
 * 必要な項目だけを要求できる。
 *
 * 他部門の結果を参照する枝はここに入れない。参照を置けるのは 1 回戦の
 * スロット編集だけで、リーグ・ダブルエリミのエントリー追加では受け付けない
 * （assign-slot/schema.ts の slotOccupantSchema が足している）。
 */
export const addEntrySchema = z.discriminatedUnion("mode", [
  existingMemberSchema,
  newMemberSchema,
]);

export type AddEntryInput = z.infer<typeof addEntrySchema>;
