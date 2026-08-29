import { z } from "zod";

/**
 * 組織の削除は Cascade で大会・メンバーまで消える。押し間違いが効かないよう、
 * 組織名の入力を求める。実際の一致判定は handler が DB の値と突き合わせる。
 */
export const deleteOrganizationSchema = z.object({
  confirmName: z.string().transform((raw) => raw.trim()),
});

export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;
