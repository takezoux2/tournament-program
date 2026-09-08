import { escapeHtml } from "@/shared/lib/html-escape";
import { greetingNameOf } from "@/shared/lib/mail/greeting";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";

export const DELETE_ACCOUNT_EMAIL_SUBJECT = "【大会運営】アカウント削除の確認";

/**
 * アカウント削除の確認メール。リンクを踏むまで削除は実行されない。
 *
 * 「ログイン中のブラウザで開く」と書いてあるのは、Better Auth の
 * delete-user/callback が有効なセッションを要求するため。メールを見た
 * スマホで開いても、そこでログインしていなければ進まない。
 */
export const buildDeleteAccountEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greeting = greetingNameOf(to);

  const text = [
    `${greeting} 様`,
    "",
    "アカウント削除の申請を受け付けました。",
    "次のリンクをログイン中のブラウザで開くと、削除が実行されます。",
    "",
    url,
    "",
    "削除すると、所属している組織からも外れます。元に戻せません。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。リンクを開かなければ削除されません。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>アカウント削除の申請を受け付けました。<br>次のリンクをログイン中のブラウザで開くと、削除が実行されます。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    "<p>削除すると、所属している組織からも外れます。元に戻せません。</p>",
    "<p>心当たりが無い場合は、このメールを破棄してください。リンクを開かなければ削除されません。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: DELETE_ACCOUNT_EMAIL_SUBJECT,
    text,
    html,
  };
};
