import type { Mailer, MailMessage } from "./types";

const SEPARATOR = "=".repeat(60);

/** 本文から最初の http(s) URL を拾う。認証 URL は本文に 1 つしか無い前提。 */
const findFirstUrl = (text: string): string | undefined =>
  text.match(/https?:\/\/\S+/)?.[0];

/**
 * Mailtrap を設定していない環境向けの代替。送信はせず、宛先・件名・
 * テキスト本文をサーバログに出す。本文には認証 URL が入っているので、
 * ログからコピーすれば登録フローを最後まで踏める。
 *
 * console.info ではなく console.warn なのは、Better Auth が確認メールを
 * レスポンス送出後に送るため、この行が next dev のログでリクエスト行から
 * 離れて流れてしまい、見落とされるため。区切り線と URL 専用行も同じ理由。
 *
 * log を引数にしているのは、テストから console を汚さずに検証するため。
 */
export const createConsoleMailer = (
  log: (message: string) => void = console.warn,
): Mailer => ({
  send: async (message: MailMessage) => {
    const url = findFirstUrl(message.text);
    log(
      [
        SEPARATOR,
        "[mail] Mailtrap が未設定のため送信しません",
        `to: ${message.to.map((address) => address.email).join(", ")}`,
        `subject: ${message.subject}`,
        // URL が無い本文(将来の別種のメール)で空ラベルを出さない。
        ...(url === undefined ? [] : [`URL: ${url}`]),
        message.text,
        SEPARATOR,
      ].join("\n"),
    );
  },
});
