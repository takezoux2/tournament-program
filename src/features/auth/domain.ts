/**
 * ログイン後の遷移先として安全な値だけを通す。
 * 外部サイトへ飛ばされるオープンリダイレクトを防ぐため、同一オリジンの
 * 絶対パスに限定する。ブラウザは "//host" と "/\host" をどちらも
 * プロトコル相対 URL として解釈するため、この 2 つを明示的に弾く。
 * さらに、ブラウザおよび Node の WHATWG URL パーサーはタブ (U+0009)・
 * LF (U+000A)・CR (U+000D) を URL 解決前に取り除いてから解釈するため、
 * 先頭のプレフィックスだけを見ていると "/\t/evil.example.com" のような
 * 値が同一オリジンの絶対パスに見えてすり抜け、解決結果は他オリジンの
 * URL になってしまう。そのため、これらの制御文字が含まれる場合は
 * 出現位置によらず（先頭でなくても）拒否する。除去して解釈し直すのではなく
 * 拒否するのは、正当な内部パスにこれらの文字が含まれることはなく、
 * 含まれていること自体が攻撃の兆候だからである。
 */
export const safeRedirectPath = (raw: string | null | undefined): string => {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\t\n\r]/.test(raw)) return "/";
  return raw;
};
