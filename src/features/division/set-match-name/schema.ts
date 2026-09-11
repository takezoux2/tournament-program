import { z } from "zod";

export const setMatchNameSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchName: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合名を入力してください")
        .max(20, "試合名は20文字までです"),
    ),
});

export type SetMatchNameInput = z.infer<typeof setMatchNameSchema>;
