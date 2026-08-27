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
    Match.tag("WeakPassword", () => "パスワードの長さが要件を満たしていません"),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
