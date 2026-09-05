const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** 一覧・詳細での開始日時の表示。 */
export const formatStartsAt = (value: Date | null): string =>
  value === null ? "未設定" : DATE_TIME_FORMAT.format(value);
