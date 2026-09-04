import { z } from "zod";

export const setMatchNumberSchema = z.object({
  matchId: z.string().min(1, "試合の指定が不正です"),
  matchNumber: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "試合番号を入力してください")
        .max(20, "試合番号は20文字までです"),
    ),
});

export type SetMatchNumberInput = z.infer<typeof setMatchNumberSchema>;
