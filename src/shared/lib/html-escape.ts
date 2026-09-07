/**
 * HTML の文脈へ差し込む値をエスケープする。
 *
 * メール本文の組み立てで、ユーザー入力（名前）と認証 URL（クエリに &
 * を含む）のどちらも素通しにはできないため使う。& を最初に置き換えるのは、
 * 後続の置換が生む "&lt;" の & をもう一度エスケープしないため。
 */
export const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
