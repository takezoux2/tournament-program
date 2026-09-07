import { Match } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";

/**
 * Match.exhaustive により、AuthError にタグを足したのにここへ文言を足し忘れると
 * コンパイルエラーになる。Effect を使う主な理由がこの網羅性チェック。
 */
export const authErrorMessage: (error: AuthError) => string =
  Match.type<AuthError>().pipe(
    Match.tag(
      "InvalidCredentials",
      // どれが誤りかを示すとアカウントの存在を推測されるため、まとめた文言にする。
      // 識別子はユーザー名でもメールアドレスでもよいので両方を並べる。
      () => "ユーザー名・メールアドレスまたはパスワードが正しくありません",
    ),
    Match.tag(
      "EmailAlreadyExists",
      () => "このメールアドレスは既に登録されています",
    ),
    Match.tag(
      "UsernameAlreadyExists",
      // プラグインが登録前に重複を弾いた結果なので、断定してよい。
      () => "そのユーザー名は既に使われています。別の名前でお試しください",
    ),
    Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
    Match.tag("InvalidUsername", () => "ユーザー名の形式が正しくありません"),
    Match.tag(
      "EmailNotVerified",
      // sendOnSignIn により、この失敗と同時に確認メールが送り直される。
      // 「再送しました」と言い切れるのはそのため。
      () => "メールアドレスが未確認です。確認メールを再送しました",
    ),
    // ここから 5 つはプロフィール画面（features/user）の経路で返るコード。
    // ログイン・登録の画面では起きないが、AuthError は 1 つの型なので
    // Match.exhaustive が網羅を要求する。到達しない前提の無難な文言を置く。
    Match.tag("InvalidPassword", () => "パスワードが正しくありません"),
    Match.tag("PasswordAlreadySet", () => "パスワードは既に設定されています"),
    Match.tag(
      "SessionNotFresh",
      () => "セキュリティのため、再度ログインしてからお試しください",
    ),
    Match.tag(
      "LastAccountUnlinkForbidden",
      () => "最後の認証方法は解除できません",
    ),
    Match.tag("AccountNotFound", () => "連携アカウントが見つかりません"),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
