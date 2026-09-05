import type { MailAddress } from "./types";

/**
 * このモジュールが読む環境変数。process.env をそのまま渡せる形にしつつ、
 * テストからは必要なキーだけのオブジェクトを渡せるようにしてある。
 */
export type MailEnv = {
  MAILTRAP_TOKEN?: string;
  MAILTRAP_SANDBOX?: string;
  MAILTRAP_TEST_INBOX_ID?: string;
  MAIL_FROM_ADDRESS?: string;
  MAIL_FROM_NAME?: string;
  NODE_ENV?: string;
};

export type MailerConfig =
  | { kind: "console" }
  | { kind: "mailtrap"; token: string; sandbox: false }
  | { kind: "mailtrap"; token: string; sandbox: true; testInboxId: number };

/**
 * 環境変数からどの Mailer を使うかを決める。
 *
 * トークンが無い環境ではコンソール出力に落として、Mailtrap の設定なしでも
 * 登録フロー全体をローカルで踏めるようにする。ただし本番で同じことをすると
 * メールが黙って消えるため、そこだけは例外にして起動時に気づけるようにする。
 */
export const resolveMailerConfig = (env: MailEnv): MailerConfig => {
  const token = env.MAILTRAP_TOKEN?.trim() ?? "";
  if (token === "") {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "MAILTRAP_TOKEN が未設定です。本番ではメール送信を無効にできません",
      );
    }
    return { kind: "console" };
  }

  if (env.MAILTRAP_SANDBOX !== "1") {
    return { kind: "mailtrap", token, sandbox: false };
  }

  // sandbox(Email Testing)は受信箱を指定しないと送り先が決まらない。
  const testInboxId = Number(env.MAILTRAP_TEST_INBOX_ID);
  if (!Number.isInteger(testInboxId) || testInboxId <= 0) {
    throw new Error(
      "MAILTRAP_SANDBOX=1 のときは MAILTRAP_TEST_INBOX_ID に受信箱 ID が必要です",
    );
  }
  return { kind: "mailtrap", token, sandbox: true, testInboxId };
};

/**
 * 差出人。未設定でも例外にはしない。届かない原因としては
 * トークン未設定より軽く、ローカルで動かす妨げにする必要が無いため。
 */
export const resolveMailFrom = (env: MailEnv): MailAddress => ({
  email: env.MAIL_FROM_ADDRESS?.trim() || "no-reply@example.com",
  name: env.MAIL_FROM_NAME?.trim() || "大会運営",
});
