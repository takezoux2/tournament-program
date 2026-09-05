import { z } from "zod";
import { optionalDateTimeLocalSchema } from "@/lib/datetime/local";

/**
 * 大会名と開始日時の検証。create / update の両スライスが使う。
 * スライス同士は依存できないが祖先方向は許可されているため、
 * カテゴリ直下に置いて両方から参照する。
 */
export const tournamentNameSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(
    z
      .string()
      .min(1, "大会名を入力してください")
      .max(100, "大会名は100文字以内で入力してください"),
  );

/**
 * 開始日時は任意。形式の検証とパースは src/lib/datetime/local.ts が持つ。
 * features/schedule の区切りの開始予定時刻とまったく同じ部品なので、
 * カテゴリをまたいで共有できるよう祖先方向の src/lib へ下ろしてある。
 */
export const startsAtSchema = optionalDateTimeLocalSchema(
  "開始日時の形式が正しくありません",
);

/**
 * 大会概要。Markdown 形式のテキスト。空文字は「未設定」を意味するため
 * 最小長は課さない。
 */
export const tournamentDescriptionSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().max(10000, "大会概要は10000文字以内で入力してください"));
