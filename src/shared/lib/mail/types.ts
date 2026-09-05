/** メールの宛先・差出人。Mailtrap の Address と同じ形にしてある。 */
export type MailAddress = {
  email: string;
  name?: string;
};

/**
 * 送信する 1 通のメール。テキストと HTML の両方を必ず持たせる。
 * HTML を読めない環境でも本文が読めるようにするため。
 */
export type MailMessage = {
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  text: string;
  html: string;
};

/**
 * メール送信の口。実装は Mailtrap 版とコンソール版の 2 つで、
 * 呼び出し側はどちらかを知らずに使う。
 */
export type Mailer = {
  send: (message: MailMessage) => Promise<void>;
};
