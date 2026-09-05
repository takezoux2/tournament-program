import type { Mailer, MailMessage } from "./types";

/**
 * Mailtrap を設定していない環境向けの代替。送信はせず、宛先・件名・
 * テキスト本文をサーバログに出す。本文には認証 URL が入っているので、
 * ログからコピーすれば登録フローを最後まで踏める。
 *
 * log を引数にしているのは、テストから console を汚さずに検証するため。
 */
export const createConsoleMailer = (
  log: (message: string) => void = console.info,
): Mailer => ({
  send: async (message: MailMessage) => {
    log(
      [
        "[mail] Mailtrap が未設定のため送信しません",
        `to: ${message.to.map((address) => address.email).join(", ")}`,
        `subject: ${message.subject}`,
        message.text,
      ].join("\n"),
    );
  },
});
