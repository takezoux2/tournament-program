/**
 * ログイン後の遷移先として安全な値だけを通す。
 * 外部サイトへ飛ばされるオープンリダイレクトを防ぐため、同一オリジンの
 * 絶対パスに限定する。ブラウザは "//host" と "/\host" をどちらも
 * プロトコル相対 URL として解釈するため、この 2 つを明示的に弾く。
 */
export const safeRedirectPath = (raw: string | null | undefined): string => {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
};
