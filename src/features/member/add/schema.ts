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

export const addMemberSchema = z.object({
  name: trimmedName("氏名"),
  nameKana: trimmedName("氏名（かな）"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
