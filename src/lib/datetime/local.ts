import { z } from "zod";

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * <input type="datetime-local"> の value 形式（YYYY-MM-DDTHH:mm）に直す。
 * ローカル時刻で組み立てるのは、入力欄がローカル時刻として解釈するため。
 * パース側の optionalDateTimeLocalSchema（new Date）と対になっている。
 *
 * 表示とパースを 1 つのモジュールに置いてあるのは、両者が同じタイムゾーンで
 * 動くことがこの往復の前提だから。表示をクライアント（ブラウザの時刻帯）で、
 * パースをサーバ（サーバの時刻帯）で行うと、時差のぶんだけ保存値がずれる。
 * したがって呼び出し側は必ずサーバ側でこの関数を通し、
 * 出来上がった文字列だけをクライアントへ渡すこと。
 */
export const toDateTimeLocalValue = (value: Date | null): string => {
  if (value === null) return "";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

// <input type="datetime-local"> が送ってくる値は YYYY-MM-DDTHH:mm 固定。
// Date.parse はこれよりずっと広い形式（日付のみ、タイムゾーン付きなど）も
// 受け付けてしまうため、正規表現で入力欄が実際に出力する形に絞る。
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * 任意入力の <input type="datetime-local"> を Date | null にする zod 部品。
 * 未入力は空文字で送られてくるため null に畳む。Date.parse はローカル時刻として
 * 解釈するので、表示側の toDateTimeLocalValue と対になる。
 *
 * エラー文言だけは項目ごとに変わる（「開始日時」「開始予定時刻」）ので引数で受ける。
 * 複数のカテゴリ（features/tournament と features/schedule）が使うため、
 * 同列に依存できるカテゴリが無い src/lib に置いて祖先方向から参照させる。
 */
export const optionalDateTimeLocalSchema = (message: string) =>
  z
    .string()
    .transform((raw) => raw.trim())
    .refine(
      (value) =>
        value === "" ||
        (DATETIME_LOCAL_PATTERN.test(value) &&
          !Number.isNaN(Date.parse(value))),
      message,
    )
    .transform((value) => (value === "" ? null : new Date(value)));
