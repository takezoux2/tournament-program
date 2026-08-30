import { z } from "zod";
import { validateSlug } from "../domain";
import { slugViolationMessage } from "../messages";
import { organizationNameSchema } from "../schema-parts";

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: z
    .string()
    .transform((raw) => raw.trim())
    .superRefine((value, ctx) => {
      // 検証の実体は domain 側に置き、スキーマからは呼ぶだけにする。
      // 文言もそこから引くことで、違反の種類と文言の対応が 1 箇所に集まる。
      const violation = validateSlug(value);
      if (violation !== null) {
        ctx.addIssue({
          code: "custom",
          message: slugViolationMessage(violation),
        });
      }
    }),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
