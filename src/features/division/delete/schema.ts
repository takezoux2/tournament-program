import { z } from "zod";

/**
 * 削除確認の入力。ここでは「何か入っている」ことしか見ない。
 * 部門名と一致するかは handler が DB の値と突き合わせる。
 */
export const deleteDivisionSchema = z.object({
  confirmName: z
    .string()
    .transform((raw) => raw.trim())
    .pipe(z.string().min(1, "確認のため部門名を入力してください")),
});

export type DeleteDivisionInput = z.infer<typeof deleteDivisionSchema>;
