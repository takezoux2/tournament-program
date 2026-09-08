import { z } from "zod";
import { displayNameSchema } from "@/shared/lib/display-name";

/**
 * name だけを持つ。Better Auth の updateUser は任意のフィールドを受け取る
 * 作りなので、スキーマで絞らないとフォームに hidden を足すだけで
 * 別の列を書き換えられてしまう。ここが唯一の絞り込み。
 */
export const updateNameSchema = z.object({
  name: displayNameSchema,
});

export type UpdateNameInput = z.infer<typeof updateNameSchema>;
