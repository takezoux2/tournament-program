/**
 * 確認リンクの有効期間。
 *
 * Better Auth の emailVerification.expiresIn、確認メールの本文、
 * 登録完了画面の案内の 3 か所で同じ値を使うため、ここに 1 つだけ持つ。
 * Better Auth の既定は 1 時間だが、翌日メールに気づく場合を考えて長くしてある。
 * 切れてもログインし直せば自動で再送されるので、長さの代償は小さい。
 */
export const VERIFICATION_LINK_EXPIRES_IN_HOURS = 24;

export const VERIFICATION_LINK_EXPIRES_IN_SECONDS =
  VERIFICATION_LINK_EXPIRES_IN_HOURS * 60 * 60;
