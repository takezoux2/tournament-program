import { z } from "zod";
import { PERMISSION_CODES } from "@/shared/authz/ability";

export const grantPermissionsSchema = z.object({
  userId: z.string().min(1, "対象のユーザーが不明です"),
  codes: z
    // enum で縛ることで、画面に無いコードを送り込んで権限を捏造されるのを防ぐ。
    .array(z.enum(PERMISSION_CODES))
    // 同じ値が 2 度来ても複合主キーの衝突にならないよう、ここで潰す。
    .transform((values) => [...new Set(values)]),
});

export type GrantPermissionsInput = z.infer<typeof grantPermissionsSchema>;
