import { z } from "zod";

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

// <input type="datetime-local"> が送ってくる値は YYYY-MM-DDTHH:mm 固定。
// Date.parse はこれよりずっと広い形式（日付のみ、タイムゾーン付きなど）も
// 受け付けてしまうため、正規表現で入力欄が実際に出力する形に絞る。
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * 開始日時は任意。<input type="datetime-local"> は未入力を空文字で送ってくるため、
 * 空文字を null に畳んでから Date にする。Date.parse はローカル時刻として
 * 解釈するので、表示側の toDateTimeLocalValue と対になる。
 */
export const startsAtSchema = z
  .string()
  .transform((raw) => raw.trim())
  .refine(
    (value) =>
      value === "" ||
      (DATETIME_LOCAL_PATTERN.test(value) && !Number.isNaN(Date.parse(value))),
    "開始日時の形式が正しくありません",
  )
  .transform((value) => (value === "" ? null : new Date(value)));

/**
 * 大会概要。Markdown 形式のテキスト。空文字は「未設定」を意味するため
 * 最小長は課さない。
 */
export const tournamentDescriptionSchema = z
  .string()
  .transform((raw) => raw.trim())
  .pipe(z.string().max(10000, "大会概要は10000文字以内で入力してください"));
