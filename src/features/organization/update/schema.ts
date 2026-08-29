import { z } from "zod";
import { organizationNameSchema } from "../schema-parts";

/**
 * slug を含めないのは、変更させないため。URL が変わると共有済みリンクと
 * ブックマークが黙って壊れる。フォームが送ってくる slug は組織の特定にだけ使い、
 * handler が requireOrganization へ渡す。
 */
export const updateOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
