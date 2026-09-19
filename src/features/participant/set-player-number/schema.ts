import { z } from "zod";

export const setPlayerNumberSchema = z.object({
  participantId: z.string().min(1, "参加者の指定が不正です"),
  playerNumber: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "選手番号を入力してください")
        .max(20, "選手番号は20文字までです"),
    ),
});

export type SetPlayerNumberInput = z.infer<typeof setPlayerNumberSchema>;
