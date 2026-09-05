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

/**
 * 画面とメール本文で共有する表示用ラベル。
 * 数値だけを共有すると、JSX と文字列結合で前後の空白の扱いが変わり、
 * 同じ定数から違う表記が出てしまうため、整形した形で 1 つ持つ。
 */
export const VERIFICATION_LINK_EXPIRES_LABEL = `${VERIFICATION_LINK_EXPIRES_IN_HOURS}時間`;
