import { Match } from "effect";
import type { AuthError } from "@/shared/errors/auth-error";

/**
 * リセットのトークンが無効・期限切れ・使用済みのときの案内文。
 *
 * /reset-password の事前チェック（password-reset/domain.ts の
 * resetTokenState）と送信時のこの失敗は同じ画面の同じ状態を指すため、
 * 文言をここに 1 つだけ置き、両方から参照する。password-reset は
 * features/auth の下位スライスでここを参照できる（祖先方向）が、逆に
 * ここから password-reset を参照することはできないため、この向きにした。
 */
export const INVALID_RESET_TOKEN_MESSAGE =
  "リンクが無効か期限切れです。お手数ですが再度お申し込みください";

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
    Match.tag(
      "InvalidResetToken",
      // 無効・期限切れ・使用済みのどれかは区別できず、また区別しても
      // 復帰手段は同じ（もう一度申請する）ためまとめた文言にする。
      () => INVALID_RESET_TOKEN_MESSAGE,
    ),
    Match.tag(
      "UnexpectedAuthError",
      () => "処理に失敗しました。時間をおいて再度お試しください",
    ),
    Match.exhaustive,
  );
