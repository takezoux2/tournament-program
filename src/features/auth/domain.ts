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

/**
 * 確認メールのリンクから /login へ戻ってきたときに出す案内文。
 * 案内が要らない通常のログイン画面では null を返す。
 *
 * errorCode は Better Auth が verify-email の失敗時に callbackURL へ足す
 * エラーコード。そのまま画面に出すと英大文字の内部コードが見えるため、
 * ここで日本語へ写像する。未知のコードも「無効」に畳む。
 * どのコードでも復帰手段は同じ（ログインを試すと再送される）ためである。
 */
export const verificationNotice = (
  verified: boolean,
  errorCode: string | null,
): string | null => {
  if (errorCode === "TOKEN_EXPIRED") {
    return "リンクの有効期限が切れています。ログインすると確認メールを送り直します";
  }
  if (errorCode !== null) {
    return "リンクが無効です。ログインすると確認メールを送り直します";
  }
  if (verified) {
    return "登録が完了しました。ログインしてください";
  }
  return null;
};

/**
 * 確認メールのリンクを踏んだ後に戻ってくる URL。
 * Better Auth はこの値を verify-email の callbackURL に埋め、成功時はここへ、
 * 失敗時は ?error=... を足してここへ返す。signup と signin の両方が同じ値を
 * 渡す必要がある（signin 側は sendOnSignIn による再送で使われる）。
 * 渡し忘れると Better Auth は "/" を使い、案内も元の遷移先も失われる。
 */
export const verificationCallbackURL = (redirectTo: string): string =>
  `/login?${new URLSearchParams({ verified: "1", redirect: redirectTo })}`;
