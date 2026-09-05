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
      // どちらが誤りかを示すとアカウントの存在を推測されるため、まとめた文言にする。
      () => "メールアドレスまたはパスワードが正しくありません",
    ),
    Match.tag(
      "EmailAlreadyExists",
      () => "このメールアドレスは既に登録されています",
    ),
    Match.tag(
      "UsernameAlreadyExists",
      // 元の FAILED_TO_CREATE_USER は「作成に失敗した」一般形で、
      // 接続断やアダプタの不具合でも返る。ユーザー名重複が最も
      // 可能性が高いというだけなので、断定はしない。
      () =>
        "そのユーザー名は既に使われている可能性があります。別の名前でお試しください",
    ),
    Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
    Match.tag(
      "EmailNotVerified",
      // sendOnSignIn により、この失敗と同時に確認メールが送り直される。
      // 「再送しました」と言い切れるのはそのため。
      () => "メールアドレスが未確認です。確認メールを再送しました",
    ),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
