import type { MailAddress } from "./types";

/**
 * HTML の文脈へ差し込む値をエスケープする。name はユーザーの入力、
 * url はクエリに & を含むため、どちらも素通しにはできない。
 *
 * 文面ビルダーが増えるたびに写すのではなく 1 か所に置く。
 * 漏れがあったときに直す場所が 1 つで済む。
 */
export const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * メールの宛名。User.name はスキーマ上 NOT NULL なので、実運用で
 * 到達しうる欠損の形は undefined ではなく空文字。トリムした上で
 * ?? ではなく || で判定しないと「 様」になってしまう。
 */
export const greetingName = (to: MailAddress): string =>
  to.name?.trim() || to.email;
