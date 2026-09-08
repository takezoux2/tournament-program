import type { MailAddress } from "./types";

/**
 * メール本文の呼びかけに使う名前を決める。
 *
 * User.name はスキーマ上 NOT NULL なので、実運用で到達しうる欠損の形は
 * undefined ではなく空文字。トリムした上で ?? ではなく || で判定しないと
 * 「 様」になってしまう。この判断はメールの種類によらず同じなので、
 * 各ビルダに書き写さず 1 か所に持つ。
 */
export const greetingNameOf = (to: MailAddress): string =>
  to.name?.trim() || to.email;
