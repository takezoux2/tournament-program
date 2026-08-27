// Better Auth のサーバー設定とクライアント側の Zod スキーマが同じ境界を使うための定数。
// どちらか一方だけを変えると、UI が通した値をサーバーが弾く不整合が起きる。
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
