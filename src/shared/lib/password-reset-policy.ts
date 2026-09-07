/**
 * パスワードリセットリンクの有効期間。
 *
 * Better Auth の emailAndPassword.resetPasswordTokenExpiresIn、リセット
 * メールの本文、申請完了画面の案内の 3 か所で同じ値を使うため、ここに
 * 1 つだけ持つ。確認メールは 24 時間まで延ばしたが、こちらは Better Auth
 * の既定値どおり 1 時間にする。切れても申請し直すだけで復帰でき、確認
 * メールのような自動再送の仕掛けを持たないため、リンクが漏れたときの窓を
 * 狭く保つ側の理由が勝る。
 */
export const PASSWORD_RESET_LINK_EXPIRES_IN_HOURS = 1;

export const PASSWORD_RESET_LINK_EXPIRES_IN_SECONDS =
  PASSWORD_RESET_LINK_EXPIRES_IN_HOURS * 60 * 60;

/**
 * 画面とメール本文で共有する表示用ラベル。
 * 数値だけを共有すると JSX と文字列結合で前後の空白の扱いが変わるため、
 * 整形した形で 1 つ持つ。
 */
export const PASSWORD_RESET_LINK_EXPIRES_LABEL = `${PASSWORD_RESET_LINK_EXPIRES_IN_HOURS}時間`;
