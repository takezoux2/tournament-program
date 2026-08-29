import { z } from "zod";

/**
 * 組織名の検証。create / update の両スライスが使う。
 * スライス同士は依存できないが祖先方向は許可されているため、
 * カテゴリ直下に置いて両方から参照する。
 */
export const organizationNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "組織名を入力してください")
      .max(100, "組織名は100文字以内で入力してください"),
  );
