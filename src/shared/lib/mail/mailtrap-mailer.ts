import type { Mailer, MailMessage } from "./types";

/**
 * MailtrapClient のうち、このアプリが使う部分だけを構造で受ける。
 * SDK の型に依存させないことで、このモジュールのテストが
 * mailtrap パッケージ(axios を抱える)を読み込まずに済む。
 */
export type MailtrapSendClient = {
  send: (mail: MailMessage) => Promise<unknown>;
};

/**
 * MailMessage の形は Mailtrap の Mail に合わせてあるため、詰め替えは要らない。
 * それでもこの層を挟むのは、戻り値を捨てて Mailer の形(Promise<void>)に
 * 揃えるためと、将来 SDK を差し替える場合の受け口を 1 か所にするため。
 */
export const createMailtrapMailer = (client: MailtrapSendClient): Mailer => ({
  send: async (message: MailMessage) => {
    await client.send(message);
  },
});
