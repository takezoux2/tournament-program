import { greetingNameOf } from "@/shared/lib/mail/greeting";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { escapeHtml } from "./html-escape";
import { PASSWORD_RESET_LINK_EXPIRES_LABEL } from "./password-reset-policy";

export const PASSWORD_RESET_EMAIL_SUBJECT = "【大会運営】パスワードの再設定";

/**
 * パスワードリセットを申請したユーザーへ送るメールを組み立てる。
 *
 * buildVerificationEmail と同じく純粋関数にしてあるのは、送信経路
 * (Mailtrap / コンソール)と切り離して文面とエスケープだけを検証できる
 * ようにするため。差出人を引数で受けるのも同じ理由で、環境変数の解決は
 * 呼び出し側(auth.ts)の責務にしてある。
 */
export const buildPasswordResetEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greetingName = greetingNameOf(to);

  const text = [
    `${greetingName} 様`,
    "",
    "パスワード再設定のお申し込みを受け付けました。",
    "次のリンクを開くと新しいパスワードを設定できます。",
    "",
    url,
    "",
    `このリンクは${PASSWORD_RESET_LINK_EXPIRES_LABEL}で無効になります。`,
    "期限が切れた場合は、もう一度お申し込みください。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
    "パスワードは変更されません。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greetingName)} 様</p>`,
    "<p>パスワード再設定のお申し込みを受け付けました。<br>次のリンクを開くと新しいパスワードを設定できます。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは${PASSWORD_RESET_LINK_EXPIRES_LABEL}で無効になります。<br>期限が切れた場合は、もう一度お申し込みください。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。パスワードは変更されません。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: PASSWORD_RESET_EMAIL_SUBJECT,
    text,
    html,
  };
};
