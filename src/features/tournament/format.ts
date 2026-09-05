const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** 一覧・詳細での開始日時の表示。 */
export const formatStartsAt = (value: Date | null): string =>
  value === null ? "未設定" : DATE_TIME_FORMAT.format(value);

/**
 * 公開ページの <title>。SNS で URL が共有される前提なので、
 * どの大会のどの画面かがタイトルだけで分かる形にする。
 */
export const formatPublicTitle = (
  tournamentName: string,
  organizationName: string,
  section?: string,
): string =>
  section === undefined
    ? `${tournamentName} | ${organizationName}`
    : `${section} | ${tournamentName} | ${organizationName}`;
