import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { VERIFICATION_LINK_EXPIRES_LABEL } from "./email-verification-policy";
import { escapeHtml } from "./html-escape";
import { greetingNameOf } from "./mail/greeting";

export const VERIFICATION_EMAIL_SUBJECT = "【大会運営】メールアドレスの確認";

/**
 * 仮登録したユーザーへ送る確認メールを組み立てる。
 *
 * 純粋関数にしてあるのは、送信経路(Mailtrap / コンソール)と切り離して
 * 文面とエスケープだけを検証できるようにするため。差出人を引数で受けるのも
 * 同じ理由で、環境変数の解決は呼び出し側(auth.ts)の責務にしてある。
 */
export const buildVerificationEmail = ({
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
    "ご登録ありがとうございます。現在は仮登録の状態です。",
    "次のリンクを開くと登録が完了します。",
    "",
    url,
    "",
    `このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。`,
    "期限が切れた場合は、ログインを試すと確認メールを送り直します。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greetingName)} 様</p>`,
    "<p>ご登録ありがとうございます。現在は仮登録の状態です。<br>次のリンクを開くと登録が完了します。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。<br>期限が切れた場合は、ログインを試すと確認メールを送り直します。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: VERIFICATION_EMAIL_SUBJECT,
    text,
    html,
  };
};
