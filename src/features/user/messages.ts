import { Match } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";

/**
 * AuthError をプロフィール画面の文脈で日本語にする。
 *
 * features/auth/messages.ts と別に持つのは 2 つの理由による。
 * 同列のカテゴリ同士は import できないこと。そして文言が文脈で変わること。
 * ログイン画面ではアカウントの存在を推測させないよう意図的に曖昧にしている
 * 文言が、本人のセッションで見るプロフィール画面では隠す相手がおらず、
 * 具体的に何をすればよいか言い切れる。
 *
 * Match.exhaustive により、AuthError にタグを足したのにここへ文言を
 * 足し忘れるとコンパイルエラーになる。
 */
export const profileErrorMessage: (error: AuthError) => string =
  Match.type<AuthError>().pipe(
    Match.tag(
      "InvalidCredentials",
      // この画面で InvalidCredentials に畳まれるのは
      // CREDENTIAL_ACCOUNT_NOT_FOUND（パスワード未設定）だけ。
      // 画面はアカウントの状態を見て設定フォームを出しているので、
      // ここへ来るのは表示後に状態が変わった競合にあたる。
      () => "パスワードが設定されていません。先に設定してください",
    ),
    Match.tag(
      "EmailAlreadyExists",
      // changeEmail は列挙対策で既存メールにも成功を返すため、通常は届かない。
      () => "このメールアドレスは使用できません",
    ),
    Match.tag(
      "UsernameAlreadyExists",
      () => "そのユーザー名は既に使われています",
    ),
    Match.tag("InvalidUsername", () => "ユーザー名の形式が正しくありません"),
    Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
    Match.tag(
      "EmailNotVerified",
      () => "メールアドレスが未確認です。確認メールのリンクを開いてください",
    ),
    Match.tag("InvalidPassword", () => "現在のパスワードが正しくありません"),
    Match.tag(
      "PasswordAlreadySet",
      () => "パスワードは既に設定されています。変更から操作してください",
    ),
    Match.tag(
      "SessionNotFresh",
      // unlinkAccount は freshSessionMiddleware を使っており、セッション作成から
      // 24 時間を過ぎると弾かれる。復帰手段はログインし直すことだけ。
      () =>
        "セキュリティのため、この操作にはログインし直しが必要です。一度ログアウトしてから再度お試しください",
    ),
    Match.tag(
      "SessionExpired",
      // sensitiveSessionMiddleware が changeEmail / changePassword /
      // setPassword / deleteUser でセッション消失を検知したときに返る。
      // 時間を置いても直らないので、再試行ではなく再ログインを案内する。
      () =>
        "ログインの有効期限が切れています。ログインし直してからもう一度お試しください",
    ),
    Match.tag(
      "LastAccountUnlinkForbidden",
      () =>
        "最後のログイン方法は解除できません。先にパスワードを設定してください",
    ),
    Match.tag("AccountNotFound", () => "その連携は見つかりませんでした"),
    Match.tag(
      "InvalidResetToken",
      // このタグはパスワードリセット画面の経路でのみ発生し、
      // プロフィール画面では到達しない。網羅のための無難な文言。
      () => "リンクが無効か期限切れです。お手数ですが再度お申し込みください",
    ),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
