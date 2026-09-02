import { z } from "zod";

export const searchUserSchema = z.object({
  query: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(
      z
        .string()
        .min(1, "ユーザー名またはメールアドレスを入力してください")
        .max(255, "入力が長すぎます"),
    ),
});

export type SearchUserInput = z.infer<typeof searchUserSchema>;
