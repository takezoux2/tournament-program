const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** 一覧・詳細での開始日時の表示。 */
export const formatStartsAt = (value: Date | null): string =>
  value === null ? "未設定" : DATE_TIME_FORMAT.format(value);

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * <input type="datetime-local"> の value 形式（YYYY-MM-DDTHH:mm）に直す。
 * ローカル時刻で組み立てるのは、入力欄がローカル時刻として解釈するため。
 * 作成・編集時のパース側（schema.ts の new Date）と対になっている。
 */
export const toDateTimeLocalValue = (value: Date | null): string => {
  if (value === null) return "";
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};
