import { resolveMailerConfig } from "@/shared/lib/mail/config";

/**
 * 起動時に 1 度だけ走るフック。
 *
 * メール設定の検証をここでやるのは、送信時まで遅らせると気づけないため。
 * Better Auth は sendVerificationEmail を runInBackgroundOrAwait で呼び、
 * 例外を catch してログに出すだけなので、本番でトークンが未設定でも
 * signup は成功したように見えてしまう（ユーザーは仮登録のまま取り残される）。
 * 起動時に落としておけば、デプロイの時点で気づける。
 */
export const register = async (): Promise<void> => {
  resolveMailerConfig(process.env);
};
