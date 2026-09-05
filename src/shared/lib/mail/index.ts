import "server-only";

import { MailtrapClient } from "mailtrap";
import { resolveMailerConfig } from "./config";
import { createConsoleMailer } from "./console-mailer";
import { createMailtrapMailer } from "./mailtrap-mailer";
import type { Mailer } from "./types";

export { resolveMailFrom } from "./config";
export type { MailAddress, Mailer, MailMessage } from "./types";

let cached: Mailer | null = null;

/**
 * 環境変数から Mailer を 1 度だけ組み立てて使い回す。
 * モジュール読み込み時ではなく初回呼び出し時に組み立てるのは、
 * 本番でトークンが無いときの例外を、ビルド時ではなく実行時に出すため。
 */
export const getMailer = (): Mailer => {
  if (cached !== null) return cached;

  const config = resolveMailerConfig(process.env);
  cached =
    config.kind === "console"
      ? createConsoleMailer()
      : createMailtrapMailer(
          new MailtrapClient({
            token: config.token,
            sandbox: config.sandbox,
            testInboxId: config.sandbox ? config.testInboxId : undefined,
          }),
        );
  return cached;
};
