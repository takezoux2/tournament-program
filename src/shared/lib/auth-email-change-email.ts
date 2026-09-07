import { escapeHtml, greetingName } from "@/shared/lib/mail/html";
import type { MailAddress, MailMessage } from "@/shared/lib/mail/types";
import { VERIFICATION_LINK_EXPIRES_LABEL } from "./email-verification-policy";

/**
 * メールアドレス変更の確認リンクを踏んだ後に戻る先。
 *
 * この値は 2 つの役目を持つ。1 つは戻り先そのもの。もう 1 つは、
 * Better Auth の sendVerificationEmail フックに渡ってくる url から
 * 「登録時の確認」と「変更時の確認」を見分けるための目印。
 * フックは requestType を受け取らないため、こちらが渡した callbackURL が
 * 唯一の手がかりになる。
 */
export const EMAIL_CHANGE_CALLBACK_URL = "/profile?emailChanged=1";

/** EMAIL_CHANGE_CALLBACK_URL のパス部分。判定はここだけを見る。 */
const EMAIL_CHANGE_CALLBACK_PATH = "/profile";

/**
 * 確認メールの url が、メールアドレス変更のものかどうか。
 *
 * callbackURL の「パス」だけを見る。中身の検索クエリまで見てしまうと、
 * /profile を開こうとして /login へ送られた人の登録確認
 * （callbackURL = "/login?verified=1&redirect=/profile"）を
 * 変更と誤判定してしまう。
 *
 * 解釈できない url では false を返す。文面の選択に失敗して
 * 送信そのものが落ちるほうが損失が大きい。
 */
export const isEmailChangeVerification = (url: string): boolean => {
  try {
    const callbackURL = new URL(url).searchParams.get("callbackURL");
    if (callbackURL === null) {
      return false;
    }
    // callbackURL は相対パス。基準は判定に使わないのでダミーで足りる。
    return (
      new URL(callbackURL, "http://localhost").pathname ===
      EMAIL_CHANGE_CALLBACK_PATH
    );
  } catch {
    return false;
  }
};

export const EMAIL_CHANGE_VERIFICATION_SUBJECT =
  "【大会運営】新しいメールアドレスの確認";

/**
 * 新しいアドレス宛に送る確認メール。リンクを踏むまで User.email は変わらない。
 * 登録時の確認メール（buildVerificationEmail）と文面を分けるのは、
 * 「仮登録の完了」という案内が変更の文脈では意味を成さないため。
 */
export const buildEmailChangeVerificationEmail = ({
  from,
  to,
  url,
}: {
  from: MailAddress;
  to: MailAddress;
  url: string;
}): MailMessage => {
  const greeting = greetingName(to);

  const text = [
    `${greeting} 様`,
    "",
    "メールアドレスの変更を受け付けました。",
    "次のリンクを開くと、このアドレスへの変更が完了します。",
    "",
    url,
    "",
    `このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。`,
    "リンクを開くまで、メールアドレスは変更されません。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
  ].join("\n");

  const safeUrl = escapeHtml(url);
  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>メールアドレスの変更を受け付けました。<br>次のリンクを開くと、このアドレスへの変更が完了します。</p>",
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>このリンクは${VERIFICATION_LINK_EXPIRES_LABEL}で無効になります。<br>リンクを開くまで、メールアドレスは変更されません。</p>`,
    "<p>心当たりが無い場合は、このメールを破棄してください。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: EMAIL_CHANGE_VERIFICATION_SUBJECT,
    text,
    html,
  };
};

export const EMAIL_CHANGE_NOTICE_SUBJECT =
  "【大会運営】メールアドレスの変更が申請されました";

/**
 * 変更前のアドレス宛に送る通知。リンクを持たせないのは、この経路で
 * 何かを操作させないため。セッションを奪われた場合に本人が気づける
 * ことだけが目的で、気づいた後の対処は変更前のアドレスでのログインになる。
 */
export const buildEmailChangeNoticeEmail = ({
  from,
  to,
  newEmail,
}: {
  from: MailAddress;
  to: MailAddress;
  newEmail: string;
}): MailMessage => {
  const greeting = greetingName(to);

  const text = [
    `${greeting} 様`,
    "",
    "アカウントのメールアドレスを次のアドレスへ変更する申請がありました。",
    "",
    newEmail,
    "",
    "新しいアドレス宛に確認メールを送信しています。",
    "そのリンクが開かれるまで、メールアドレスは変更されません。",
    "",
    "心当たりが無い場合は、パスワードの変更をご検討ください。",
  ].join("\n");

  const html = [
    '<html><head><meta charset="utf-8"></head><body>',
    `<p>${escapeHtml(greeting)} 様</p>`,
    "<p>アカウントのメールアドレスを次のアドレスへ変更する申請がありました。</p>",
    `<p>${escapeHtml(newEmail)}</p>`,
    "<p>新しいアドレス宛に確認メールを送信しています。<br>そのリンクが開かれるまで、メールアドレスは変更されません。</p>",
    "<p>心当たりが無い場合は、パスワードの変更をご検討ください。</p>",
    "</body></html>",
  ].join("\n");

  return {
    from,
    to: [to],
    subject: EMAIL_CHANGE_NOTICE_SUBJECT,
    text,
    html,
  };
};
