import { INVALID_RESET_TOKEN_MESSAGE } from "@/features/auth/messages";

/**
 * リセットメールのリンクを踏んだ後に戻ってくるパス。
 *
 * Better Auth はこの値を /request-password-reset の redirectTo として受け取り、
 * originCheck を通した上でメール本文の URL に callbackURL として埋める。
 * ログインや新規登録と違い、ここには外から来た遷移先を流さない。流すと
 * メールに任意のパスを埋められる経路ができ、オープンリダイレクトの面が
 * 増えるためである。リセット完了後は常に /login へ戻す。
 */
export const PASSWORD_RESET_REDIRECT_TO = "/reset-password";

/** 再設定に成功した後の遷移先。reset=1 が passwordResetNotice の案内を出す。 */
export const PASSWORD_RESET_DONE_PATH = "/login?reset=1";

/**
 * /reset-password の表示状態。フォームを出す場合はトークンを、出さない
 * 場合は理由の案内文を持つ。
 */
export type ResetTokenState =
  | { kind: "form"; token: string }
  | { kind: "invalid"; message: string };

/**
 * /reset-password に届いたクエリを表示状態へ写す。
 *
 * Better Auth の reset-password/:token は、トークンが有効なら
 * ?token=... を、無効・期限切れなら ?error=INVALID_TOKEN を付けて
 * ここへリダイレクトする（api/routes/password.mjs）。error の有無と
 * token の有無を別々に扱わないのは、どちらも復帰手段が
 * 「もう一度申請する」で同じだからである。
 */
export const resetTokenState = (
  token: string | null,
  errorCode: string | null,
): ResetTokenState => {
  if (errorCode !== null || token === null || token === "") {
    return {
      kind: "invalid",
      message: INVALID_RESET_TOKEN_MESSAGE,
    };
  }
  return { kind: "form", token };
};

/**
 * 再設定を終えて /login?reset=1 へ戻ってきたときに出す案内文。
 * 案内が要らない通常のログイン画面では null を返す。
 *
 * 確認メールの verificationNotice とは出る条件も文面も別物なので、
 * 1 つの関数にまとめず隣に置く。
 */
export const passwordResetNotice = (reset: boolean): string | null =>
  reset
    ? "パスワードを再設定しました。新しいパスワードでログインしてください"
    : null;
