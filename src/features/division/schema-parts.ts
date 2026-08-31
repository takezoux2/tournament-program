import { z } from "zod";
import { DivisionFormat } from "@/generated/prisma/enums";

/**
 * 部門名と試合形式の検証。create / update の両スライスが使う。
 * スライス同士は依存できないが祖先方向は許可されているため、
 * カテゴリ直下に置いて両方から参照する。tournament/schema-parts.ts と同じ形。
 */
export const divisionNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "部門名を入力してください")
      .max(100, "部門名は100文字以内で入力してください"),
  );

/**
 * z.enum に生成された enum オブジェクトを渡しているので、スキーマに形式を足すと
 * ここは自動で追従する。出力型は DivisionFormat になる。
 */
export const divisionFormatSchema = z.enum(DivisionFormat, {
  error: "試合形式を選択してください",
});
