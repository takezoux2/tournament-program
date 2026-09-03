/**
 * username は User テーブルで unique。大文字小文字が違うだけの 2 アカウントを
 * 登録できてしまうと検索も外れるため、保存も検索も小文字に揃える。
 * signup（features/auth）と検索（features/organization-user）の両方から使うので、
 * normalizeEmail と同じくどちらのスライスにも属さない shared に置く。
 */
export const normalizeUsername = (raw: string): string =>
  raw.trim().toLowerCase();
